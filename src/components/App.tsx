import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  BatchAction,
  BatchState,
  DownloadProgress,
  ImageItem,
  ImageStatus,
  ModelStatus,
  WorkerOutMessage,
} from "../lib/types";
import type { FileRejection } from "react-dropzone";
import { heicTo } from "heic-to/csp";
import { compositeFullResolution } from "../lib/compositor";
import { enqueueProcessing } from "../lib/queue";
import { DropZone } from "./DropZone";
import { ModelProgress } from "./ModelProgress";

// ---------------------------------------------------------------------------
// HEIC helpers (unchanged from Phase 1)
// ---------------------------------------------------------------------------

const HEIC_TYPES = new Set(["image/heic", "image/heif"]);
const HEIC_EXTENSIONS = new Set([".heic", ".heif"]);

function isHeicFile(file: File): boolean {
  if (HEIC_TYPES.has(file.type)) return true;
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  return HEIC_EXTENSIONS.has(ext);
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const jpegBlob = await heicTo({
    blob: file,
    type: "image/jpeg",
    quality: 0.95,
  });
  const name = file.name
    .replace(/\.heic$/i, ".jpg")
    .replace(/\.heif$/i, ".jpg");
  return new File([jpegBlob], name, { type: "image/jpeg" });
}

// ---------------------------------------------------------------------------
// Batch reducer
// ---------------------------------------------------------------------------

const initialBatchState: BatchState = {
  images: [],
  backgroundMode: "transparent",
};

function batchReducer(state: BatchState, action: BatchAction): BatchState {
  switch (action.type) {
    case "ADD_IMAGES":
      return { ...state, images: [...state.images, ...action.items] };

    case "SET_QUEUED":
      return {
        ...state,
        images: state.images.map((img) =>
          img.id === action.id ? { ...img, status: "queued" as ImageStatus } : img,
        ),
      };

    case "SET_PROCESSING":
      return {
        ...state,
        images: state.images.map((img) =>
          img.id === action.id
            ? { ...img, status: "processing" as ImageStatus }
            : img,
        ),
      };

    case "SET_DONE":
      return {
        ...state,
        images: state.images.map((img) =>
          img.id === action.id
            ? {
                ...img,
                status: "done" as ImageStatus,
                resultUrl: action.resultUrl,
                resultWhiteUrl: action.resultWhiteUrl,
              }
            : img,
        ),
      };

    case "SET_ERROR":
      return {
        ...state,
        images: state.images.map((img) =>
          img.id === action.id
            ? {
                ...img,
                status: "error" as ImageStatus,
                error: action.error,
              }
            : img,
        ),
      };

    case "RETRY": {
      // Revoke old result URLs before retrying
      const target = state.images.find((img) => img.id === action.id);
      if (target?.resultUrl) URL.revokeObjectURL(target.resultUrl);
      if (target?.resultWhiteUrl) URL.revokeObjectURL(target.resultWhiteUrl);
      return {
        ...state,
        images: state.images.map((img) =>
          img.id === action.id
            ? {
                ...img,
                status: "queued" as ImageStatus,
                error: undefined,
                resultUrl: undefined,
                resultWhiteUrl: undefined,
              }
            : img,
        ),
      };
    }

    case "REMOVE": {
      const target = state.images.find((img) => img.id === action.id);
      if (target) {
        URL.revokeObjectURL(target.originalUrl);
        if (target.resultUrl) URL.revokeObjectURL(target.resultUrl);
        if (target.resultWhiteUrl) URL.revokeObjectURL(target.resultWhiteUrl);
      }
      return {
        ...state,
        images: state.images.filter((img) => img.id !== action.id),
      };
    }

    case "SET_BACKGROUND_MODE":
      return { ...state, backgroundMode: action.mode };

    case "CLEAR_ALL": {
      // Revoke ALL Blob URLs
      for (const img of state.images) {
        URL.revokeObjectURL(img.originalUrl);
        if (img.resultUrl) URL.revokeObjectURL(img.resultUrl);
        if (img.resultWhiteUrl) URL.revokeObjectURL(img.resultWhiteUrl);
      }
      return { ...state, images: [] };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Unique ID generator
// ---------------------------------------------------------------------------

let idCounter = 0;
function nextId(): string {
  return `img-${Date.now()}-${++idCounter}`;
}

// ---------------------------------------------------------------------------
// App component
// ---------------------------------------------------------------------------

export function App() {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const [modelStatus, setModelStatus] = useReducer(
    (_: ModelStatus, next: ModelStatus) => next,
    "idle" as ModelStatus,
  );
  const [downloadProgress, setDownloadProgress] = useReducer(
    (_: DownloadProgress | null, next: DownloadProgress | null) => next,
    null as DownloadProgress | null,
  );
  const [state, dispatch] = useReducer(batchReducer, initialBatchState);

  // -------------------------------------------------------------------------
  // Refs
  // -------------------------------------------------------------------------
  const workerRef = useRef<Worker | null>(null);
  const fileProgressRef = useRef<
    Map<string, { loaded: number; total: number }>
  >(new Map());

  // stateRef pattern: keep a ref that mirrors state so async callbacks
  // (processOneImage) can read current state without stale closures
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Pending inference promises: Map<imageId, {resolve, reject}>
  const pendingInferencesRef = useRef<
    Map<
      string,
      {
        resolve: (maskData: {
          data: Uint8ClampedArray;
          width: number;
          height: number;
          channels: number;
        }) => void;
        reject: (error: Error) => void;
      }
    >
  >(new Map());

  // -------------------------------------------------------------------------
  // Cross-origin isolation check
  // -------------------------------------------------------------------------
  const isIsolated =
    typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;

  // -------------------------------------------------------------------------
  // Worker creation + message handler
  // -------------------------------------------------------------------------
  useEffect(() => {
    workerRef.current = new Worker(
      new URL("../workers/inference.worker.ts", import.meta.url),
      { type: "module" },
    );

    // Eagerly start model loading
    workerRef.current.postMessage({ type: "load-model" });

    const worker = workerRef.current;

    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data;

      switch (msg.type) {
        case "model-progress": {
          if (msg.status === "downloading" || msg.status === "progress") {
            setModelStatus("downloading");

            const fileKey = msg.file ?? msg.name ?? "unknown";
            const loaded = msg.loaded ?? 0;
            const total = msg.total ?? 0;

            if (total > 0) {
              fileProgressRef.current.set(fileKey, { loaded, total });
            }

            let sumLoaded = 0;
            let sumTotal = 0;
            for (const entry of fileProgressRef.current.values()) {
              sumLoaded += entry.loaded;
              sumTotal += entry.total;
            }

            if (sumTotal > 0) {
              setDownloadProgress({ loaded: sumLoaded, total: sumTotal });
            }
          }
          break;
        }

        case "model-ready":
          setModelStatus("ready");
          setDownloadProgress(null);
          break;

        case "model-error":
          setModelStatus("error");
          break;

        case "inference-start":
          // No action needed -- status already set to "processing" before postMessage
          break;

        case "inference-complete": {
          const pending = pendingInferencesRef.current.get(msg.imageId);
          if (pending) {
            pendingInferencesRef.current.delete(msg.imageId);
            pending.resolve(msg.maskData);
          }
          break;
        }

        case "inference-error": {
          const pending = pendingInferencesRef.current.get(msg.imageId);
          if (pending) {
            pendingInferencesRef.current.delete(msg.imageId);
            pending.reject(new Error(msg.error));
          }
          break;
        }
      }
    };

    return () => {
      worker.onmessage = null;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Blob URL cleanup on unmount
  // -------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      for (const img of stateRef.current.images) {
        URL.revokeObjectURL(img.originalUrl);
        if (img.resultUrl) URL.revokeObjectURL(img.resultUrl);
        if (img.resultWhiteUrl) URL.revokeObjectURL(img.resultWhiteUrl);
      }
    };
  }, []);

  // -------------------------------------------------------------------------
  // Process one image (called by concurrency queue)
  // -------------------------------------------------------------------------
  const processOneImage = useCallback(
    async (id: string) => {
      const image = stateRef.current.images.find((img) => img.id === id);
      if (!image) return;

      dispatch({ type: "SET_PROCESSING", id });

      try {
        // 1. Send to worker for inference
        const maskData = await new Promise<{
          data: Uint8ClampedArray;
          width: number;
          height: number;
          channels: number;
        }>((resolve, reject) => {
          pendingInferencesRef.current.set(id, { resolve, reject });
          workerRef.current?.postMessage({
            type: "process",
            imageId: id,
            imageData: image.file,
          });
        });

        // 2. Generate transparent PNG
        const transparentBlob = await compositeFullResolution(
          image.file,
          maskData,
          "transparent",
        );
        const resultUrl = URL.createObjectURL(transparentBlob);

        // 3. Generate white-background JPG
        const whiteBlob = await compositeFullResolution(
          image.file,
          maskData,
          "white",
        );
        const resultWhiteUrl = URL.createObjectURL(whiteBlob);

        dispatch({ type: "SET_DONE", id, resultUrl, resultWhiteUrl });
      } catch (err) {
        dispatch({
          type: "SET_ERROR",
          id,
          error: err instanceof Error ? err.message : "Processing failed",
        });
      }
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Handle accepted files from DropZone
  // -------------------------------------------------------------------------
  const handleFilesAccepted = useCallback(
    async (files: File[]) => {
      // Convert HEIC at drop time, before entering the queue
      const items: ImageItem[] = await Promise.all(
        files.map(async (file) => {
          const processedFile = isHeicFile(file)
            ? await convertHeicToJpeg(file)
            : file;

          return {
            id: nextId(),
            file: processedFile,
            name: file.name, // Original filename for display
            status: "idle" as const,
            originalUrl: URL.createObjectURL(processedFile),
          };
        }),
      );

      dispatch({ type: "ADD_IMAGES", items });

      // Set all to queued and enqueue
      const ids = items.map((item) => item.id);
      for (const id of ids) {
        dispatch({ type: "SET_QUEUED", id });
      }

      enqueueProcessing(ids, processOneImage);
    },
    [processOneImage],
  );

  // -------------------------------------------------------------------------
  // Handle rejected files from DropZone (no-op, DropZone shows errors)
  // -------------------------------------------------------------------------
  const handleFilesRejected = useCallback((_rejections: FileRejection[]) => {
    // DropZone component handles showing rejection errors internally
  }, []);

  // -------------------------------------------------------------------------
  // Retry a failed image
  // -------------------------------------------------------------------------
  const handleRetry = useCallback(
    (id: string) => {
      dispatch({ type: "RETRY", id });
      enqueueProcessing([id], processOneImage);
    },
    [processOneImage],
  );

  // -------------------------------------------------------------------------
  // Remove a single image
  // -------------------------------------------------------------------------
  const handleRemove = useCallback((id: string) => {
    dispatch({ type: "REMOVE", id });
  }, []);

  // -------------------------------------------------------------------------
  // Clear all images
  // -------------------------------------------------------------------------
  const handleClearAll = useCallback(() => {
    dispatch({ type: "CLEAR_ALL" });
  }, []);

  // -------------------------------------------------------------------------
  // Derived counts
  // -------------------------------------------------------------------------
  const totalCount = state.images.length;
  const doneCount = state.images.filter((i) => i.status === "done").length;
  const errorCount = state.images.filter((i) => i.status === "error").length;
  const processingCount = state.images.filter(
    (i) => i.status === "processing",
  ).length;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex min-h-screen flex-col items-center gap-6 p-6">
      <h1 className="text-4xl font-bold text-gray-900">BatchClear.io</h1>
      <p className="text-lg text-gray-600">
        Browser-native batch background removal
      </p>

      {/* Model progress */}
      {modelStatus !== "ready" && modelStatus !== "idle" && (
        <ModelProgress status={modelStatus} progress={downloadProgress} />
      )}
      {modelStatus === "ready" && totalCount === 0 && (
        <ModelProgress status={modelStatus} progress={null} />
      )}

      {/* Drop zone */}
      <DropZone
        onFilesAccepted={handleFilesAccepted}
        onFilesRejected={handleFilesRejected}
        disabled={modelStatus === "error"}
        imageCount={totalCount}
      />

      {/* Batch progress summary */}
      {totalCount > 0 && (
        <div className="flex w-full max-w-2xl items-center justify-between">
          <p className="text-sm text-gray-600">
            {doneCount} of {totalCount} processed
            {processingCount > 0 && ` (${processingCount} in progress)`}
            {errorCount > 0 && (
              <span className="ml-2 text-red-600">
                {errorCount} failed
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={handleClearAll}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Image list */}
      {totalCount > 0 && (
        <div className="w-full max-w-2xl space-y-2">
          {state.images.map((img) => (
            <div
              key={img.id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              {/* Thumbnail */}
              <img
                src={img.resultUrl ?? img.originalUrl}
                alt={img.name}
                className="h-12 w-12 rounded object-cover"
              />

              {/* Name + status */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {img.name}
                </p>
                <StatusBadge status={img.status} error={img.error} />
              </div>

              {/* Actions */}
              {img.status === "error" && (
                <button
                  type="button"
                  onClick={() => handleRetry(img.id)}
                  className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                >
                  Retry
                </button>
              )}
              <button
                type="button"
                onClick={() => handleRemove(img.id)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label={`Remove ${img.name}`}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Cross-origin isolation indicator */}
      <div className="fixed bottom-3 right-3 flex items-center gap-2 text-xs">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            isIsolated ? "bg-green-500" : "bg-red-500"
          }`}
        />
        <span className="text-gray-400">
          crossOriginIsolated:{" "}
          <code className="font-mono">{String(isIsolated)}</code>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge sub-component
// ---------------------------------------------------------------------------

function StatusBadge({
  status,
  error,
}: {
  status: ImageStatus;
  error?: string;
}) {
  const styles: Record<ImageStatus, string> = {
    idle: "text-gray-500",
    queued: "text-yellow-600",
    processing: "text-blue-600",
    done: "text-green-600",
    error: "text-red-600",
  };

  const labels: Record<ImageStatus, string> = {
    idle: "Waiting",
    queued: "Queued",
    processing: "Processing...",
    done: "Done",
    error: "Error",
  };

  return (
    <p className={`text-xs ${styles[status]}`}>
      {labels[status]}
      {status === "error" && error && (
        <span className="ml-1 text-red-500">- {error}</span>
      )}
    </p>
  );
}
