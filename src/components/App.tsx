import { useCallback, useEffect, useReducer, useRef, useState } from "react";
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
import {
  generateBatchZip,
  triggerDownload,
  downloadSingleImage,
} from "../lib/download";
import { createThumbnailUrl } from "../lib/thumbnail";
import { DropZone } from "./DropZone";
import { ModelProgress } from "./ModelProgress";
import { ThemeToggle } from "./ThemeToggle";
import { BackgroundToggle } from "./BackgroundToggle";
import { BatchProgress } from "./BatchProgress";
import { ImageGrid } from "./ImageGrid";

// ---------------------------------------------------------------------------
// HEIC helpers
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
          img.id === action.id
            ? { ...img, status: "queued" as ImageStatus }
            : img,
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
                resultThumbUrl: action.resultThumbUrl,
                resultWhiteThumbUrl: action.resultWhiteThumbUrl,
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
      const target = state.images.find((img) => img.id === action.id);
      if (target?.resultUrl) URL.revokeObjectURL(target.resultUrl);
      if (target?.resultWhiteUrl) URL.revokeObjectURL(target.resultWhiteUrl);
      if (target?.resultThumbUrl) URL.revokeObjectURL(target.resultThumbUrl);
      if (target?.resultWhiteThumbUrl)
        URL.revokeObjectURL(target.resultWhiteThumbUrl);
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
                resultThumbUrl: undefined,
                resultWhiteThumbUrl: undefined,
              }
            : img,
        ),
      };
    }

    case "REMOVE": {
      const target = state.images.find((img) => img.id === action.id);
      if (target) {
        URL.revokeObjectURL(target.originalUrl);
        URL.revokeObjectURL(target.thumbnailUrl);
        if (target.resultUrl) URL.revokeObjectURL(target.resultUrl);
        if (target.resultWhiteUrl) URL.revokeObjectURL(target.resultWhiteUrl);
        if (target.resultThumbUrl) URL.revokeObjectURL(target.resultThumbUrl);
        if (target.resultWhiteThumbUrl)
          URL.revokeObjectURL(target.resultWhiteThumbUrl);
      }
      return {
        ...state,
        images: state.images.filter((img) => img.id !== action.id),
      };
    }

    case "SET_BACKGROUND_MODE":
      return { ...state, backgroundMode: action.mode };

    case "CLEAR_ALL": {
      for (const img of state.images) {
        URL.revokeObjectURL(img.originalUrl);
        URL.revokeObjectURL(img.thumbnailUrl);
        if (img.resultUrl) URL.revokeObjectURL(img.resultUrl);
        if (img.resultWhiteUrl) URL.revokeObjectURL(img.resultWhiteUrl);
        if (img.resultThumbUrl) URL.revokeObjectURL(img.resultThumbUrl);
        if (img.resultWhiteThumbUrl)
          URL.revokeObjectURL(img.resultWhiteThumbUrl);
      }
      return { ...state, images: [] };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Navigation warning hook
// ---------------------------------------------------------------------------

function useNavigationWarning(shouldWarn: boolean): void {
  useEffect(() => {
    if (!shouldWarn) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = true; // Legacy Chrome/Edge < 119
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [shouldWarn]);
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
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [zipProgress, setZipProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  // -------------------------------------------------------------------------
  // Refs
  // -------------------------------------------------------------------------
  const workerRef = useRef<Worker | null>(null);
  const fileProgressRef = useRef<
    Map<string, { loaded: number; total: number }>
  >(new Map());

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Map of id -> File, updated synchronously so processOneImage can access
  // files immediately (before React re-renders and stateRef catches up).
  const filesRef = useRef<Map<string, File>>(new Map());

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
  // Worker creation + message handler
  // -------------------------------------------------------------------------
  useEffect(() => {
    workerRef.current = new Worker(
      new URL("../workers/inference.worker.ts", import.meta.url),
      { type: "module" },
    );

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
        URL.revokeObjectURL(img.thumbnailUrl);
        if (img.resultUrl) URL.revokeObjectURL(img.resultUrl);
        if (img.resultWhiteUrl) URL.revokeObjectURL(img.resultWhiteUrl);
        if (img.resultThumbUrl) URL.revokeObjectURL(img.resultThumbUrl);
        if (img.resultWhiteThumbUrl)
          URL.revokeObjectURL(img.resultWhiteThumbUrl);
      }
    };
  }, []);

  // -------------------------------------------------------------------------
  // Process one image (called by concurrency queue)
  // -------------------------------------------------------------------------
  const processOneImage = useCallback(async (id: string) => {
    const file = filesRef.current.get(id);
    if (!file) return;

    dispatch({ type: "SET_PROCESSING", id });

    try {
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
          imageData: file,
        });
      });

      const transparentBlob = await compositeFullResolution(
        file,
        maskData,
        "transparent",
      );
      const resultUrl = URL.createObjectURL(transparentBlob);
      const resultThumbUrl = await createThumbnailUrl(
        transparentBlob,
        600,
        "image/png",
      );

      const whiteBlob = await compositeFullResolution(
        file,
        maskData,
        "white",
      );
      const resultWhiteUrl = URL.createObjectURL(whiteBlob);
      const resultWhiteThumbUrl = await createThumbnailUrl(
        whiteBlob,
        600,
        "image/jpeg",
      );

      dispatch({
        type: "SET_DONE",
        id,
        resultUrl,
        resultWhiteUrl,
        resultThumbUrl,
        resultWhiteThumbUrl,
      });
    } catch (err) {
      dispatch({
        type: "SET_ERROR",
        id,
        error: err instanceof Error ? err.message : "Processing failed",
      });
    }
  }, []);

  // -------------------------------------------------------------------------
  // Handle accepted files from DropZone
  // -------------------------------------------------------------------------
  const handleFilesAccepted = useCallback(
    async (files: File[]) => {
      // Process files SEQUENTIALLY to avoid OOM from parallel full-res decodes.
      // Each HEIC conversion + thumbnail generation decodes a full-res bitmap
      // (~48MB per 12MP image). Parallel processing of 14+ files would exceed
      // Safari's per-tab memory limit.
      const items: ImageItem[] = [];
      for (const file of files) {
        const processedFile = isHeicFile(file)
          ? await convertHeicToJpeg(file)
          : file;

        const originalUrl = URL.createObjectURL(processedFile);
        const thumbnailUrl = await createThumbnailUrl(
          processedFile,
          600,
          "image/jpeg",
        );

        items.push({
          id: nextId(),
          file: processedFile,
          name: file.name,
          status: "idle" as const,
          originalUrl,
          thumbnailUrl,
        });
      }

      // Store files synchronously BEFORE dispatching so processOneImage
      // can access them immediately (stateRef lags behind by one render).
      for (const item of items) {
        filesRef.current.set(item.id, item.file);
      }

      dispatch({ type: "ADD_IMAGES", items });
      setHasDownloaded(false);

      const ids = items.map((item) => item.id);
      for (const id of ids) {
        dispatch({ type: "SET_QUEUED", id });
      }

      enqueueProcessing(ids, processOneImage);
    },
    [processOneImage],
  );

  // -------------------------------------------------------------------------
  // Handle rejected files
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
    filesRef.current.delete(id);
    dispatch({ type: "REMOVE", id });
  }, []);

  // -------------------------------------------------------------------------
  // Clear all images
  // -------------------------------------------------------------------------
  const handleClearAll = useCallback(() => {
    filesRef.current.clear();
    dispatch({ type: "CLEAR_ALL" });
    setHasDownloaded(false);
  }, []);

  // -------------------------------------------------------------------------
  // Download handlers
  // -------------------------------------------------------------------------
  const handleDownloadAll = useCallback(async () => {
    const doneImages = state.images.filter((i) => i.status === "done");
    if (doneImages.length === 0) return;

    try {
      setZipProgress({ current: 0, total: doneImages.length });
      const blob = await generateBatchZip(
        state.images,
        state.backgroundMode,
        (current, total) => setZipProgress({ current, total }),
      );
      triggerDownload(blob, "batchclear-results.zip");
      setHasDownloaded(true);
    } catch {
      // ZIP generation failed -- user can retry
    } finally {
      setZipProgress(null);
    }
  }, [state.images, state.backgroundMode]);

  const handleDownloadSingle = useCallback(
    (image: ImageItem) => {
      const blobUrl =
        state.backgroundMode === "transparent"
          ? image.resultUrl
          : image.resultWhiteUrl;
      if (blobUrl) {
        downloadSingleImage(blobUrl, image.name, state.backgroundMode);
      }
    },
    [state.backgroundMode],
  );

  // -------------------------------------------------------------------------
  // Derived counts
  // -------------------------------------------------------------------------
  const totalCount = state.images.length;
  const doneCount = state.images.filter((i) => i.status === "done").length;
  const errorCount = state.images.filter((i) => i.status === "error").length;
  const processingCount = state.images.filter(
    (i) => i.status === "processing",
  ).length;
  const hasAnyDone = doneCount > 0;
  const atLimit = totalCount >= 100;
  const isProcessing = state.images.some(
    (i) => i.status === "processing" || i.status === "queued",
  );
  const hasUndownloaded = doneCount > 0 && !hasDownloaded;

  // -------------------------------------------------------------------------
  // Navigation warning
  // -------------------------------------------------------------------------
  useNavigationWarning(isProcessing || hasUndownloaded);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex min-h-screen flex-col dark:text-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/80 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              BatchClear.io
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Background removal
            </p>
          </div>
          <div className="flex items-center gap-3">
            {hasAnyDone && (
              <BackgroundToggle
                mode={state.backgroundMode}
                onChange={(mode) =>
                  dispatch({ type: "SET_BACKGROUND_MODE", mode })
                }
              />
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-y-auto scroll-smooth">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          {/* Model progress */}
          {modelStatus !== "ready" && modelStatus !== "idle" && (
            <div className="mb-6 flex justify-center">
              <ModelProgress status={modelStatus} progress={downloadProgress} />
            </div>
          )}
          {modelStatus === "ready" && totalCount === 0 && (
            <div className="mb-6 flex justify-center">
              <ModelProgress status={modelStatus} progress={null} />
            </div>
          )}

          {/* Drop zone */}
          {atLimit ? (
            <div className="mb-6 rounded-lg bg-yellow-50 px-4 py-3 text-center text-sm text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
              Maximum 100 images reached
            </div>
          ) : (
            <div
              className={`mb-6 ${totalCount === 0 ? "flex justify-center" : ""}`}
            >
              <DropZone
                onFilesAccepted={handleFilesAccepted}
                onFilesRejected={handleFilesRejected}
                disabled={modelStatus === "error"}
                imageCount={totalCount}
                compact={totalCount > 0}
              />
            </div>
          )}

          {/* Batch progress + Clear all */}
          {totalCount > 0 && (
            <div className="mb-4 flex items-end gap-4">
              <div className="flex-1">
                <BatchProgress
                  total={totalCount}
                  done={doneCount}
                  processing={processingCount}
                  errors={errorCount}
                />
              </div>
              {hasAnyDone && (
                <button
                  type="button"
                  onClick={handleDownloadAll}
                  disabled={zipProgress !== null}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-600"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4v12m0 0l-4-4m4 4l4-4M4 18h16"
                    />
                  </svg>
                  {zipProgress
                    ? `Generating ZIP... ${zipProgress.current}/${zipProgress.total}`
                    : "Download All (ZIP)"}
                </button>
              )}
              <button
                type="button"
                onClick={handleClearAll}
                className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Image grid */}
          <ImageGrid
            images={state.images}
            backgroundMode={state.backgroundMode}
            onRetry={handleRetry}
            onRemove={handleRemove}
            onDownload={handleDownloadSingle}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white/60 py-3 text-center text-xs text-gray-400 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-500">
        Processed locally in your browser &mdash; your images never leave this device
      </footer>
    </div>
  );
}
