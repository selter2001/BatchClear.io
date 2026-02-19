import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DownloadProgress,
  ModelStatus,
  WorkerOutMessage,
} from "../lib/types";
import { heicTo } from "heic-to/csp";
import { compositeFullResolution } from "../lib/compositor";
import { DropZone } from "./DropZone";
import { ModelProgress } from "./ModelProgress";
import { ResultView } from "./ResultView";

const HEIC_TYPES = new Set(["image/heic", "image/heif"]);
const HEIC_EXTENSIONS = new Set([".heic", ".heif"]);

function isHeicFile(file: File): boolean {
  if (HEIC_TYPES.has(file.type)) return true;
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  return HEIC_EXTENSIONS.has(ext);
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const jpegBlob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.95 });
  const name = file.name.replace(/\.heic$/i, ".jpg").replace(/\.heif$/i, ".jpg");
  return new File([jpegBlob], name, { type: "image/jpeg" });
}

export function App() {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const [modelStatus, setModelStatus] = useState<ModelStatus>("idle");
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Refs
  // -------------------------------------------------------------------------
  const workerRef = useRef<Worker | null>(null);
  // Track per-file download progress for accurate totals
  const fileProgressRef = useRef<Map<string, { loaded: number; total: number }>>(
    new Map(),
  );
  // Keep a ref to originalFile for use in the worker message handler
  // (avoids stale closure over state)
  const originalFileRef = useRef<File | null>(null);

  // -------------------------------------------------------------------------
  // Cross-origin isolation check
  // -------------------------------------------------------------------------
  const isIsolated =
    typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;

  // -------------------------------------------------------------------------
  // Worker creation + message handler
  // -------------------------------------------------------------------------
  useEffect(() => {
    // MUST be inline -- Vite statically analyzes this pattern
    workerRef.current = new Worker(
      new URL("../workers/inference.worker.ts", import.meta.url),
      { type: "module" },
    );

    // Eagerly start model loading so it's ready when user drops an image
    workerRef.current.postMessage({ type: "load-model" });

    const worker = workerRef.current;

    worker.onmessage = async (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data;

      switch (msg.type) {
        case "model-progress": {
          // Track per-file progress to compute accurate totals
          if (msg.status === "downloading" || msg.status === "progress") {
            setModelStatus("downloading");

            const fileKey = msg.file ?? msg.name ?? "unknown";
            const loaded = msg.loaded ?? 0;
            const total = msg.total ?? 0;

            if (total > 0) {
              fileProgressRef.current.set(fileKey, { loaded, total });
            }

            // Sum across all tracked files
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

        case "model-ready": {
          setModelStatus("ready");
          setDownloadProgress(null);
          break;
        }

        case "model-error": {
          setModelStatus("error");
          setError(msg.error);
          break;
        }

        case "inference-start": {
          // Optional: could add logging here
          break;
        }

        case "inference-complete": {
          try {
            const file = originalFileRef.current;
            if (!file) {
              throw new Error("Original file reference lost during processing");
            }

            const resultBlob = await compositeFullResolution(
              file,
              msg.maskData,
            );
            const url = URL.createObjectURL(resultBlob);
            setResultUrl(url);
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Compositor failed",
            );
          } finally {
            setIsProcessing(false);
          }
          break;
        }

        case "inference-error": {
          setError(msg.error);
          setIsProcessing(false);
          break;
        }
      }
    };

    // Cleanup: Do NOT terminate the worker -- WASM memory leak pitfall.
    // Only clean up the message handler.
    return () => {
      worker.onmessage = null;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Blob URL cleanup on unmount
  // -------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (resultUrl) {
        URL.revokeObjectURL(resultUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Drop handler
  // -------------------------------------------------------------------------
  const handleFileDrop = useCallback(
    async (file: File) => {
      // Revoke previous result URL to prevent memory leaks
      if (resultUrl) {
        URL.revokeObjectURL(resultUrl);
      }

      setResultUrl(null);
      setError(null);
      setIsProcessing(true);

      try {
        // Convert HEIC to JPEG before processing (browsers don't support HEIC natively)
        const processFile = isHeicFile(file) ? await convertHeicToJpeg(file) : file;

        setOriginalFile(processFile);
        originalFileRef.current = processFile;

        workerRef.current?.postMessage({
          type: "process",
          imageId: "single",
          imageData: processFile,
        });
      } catch (err) {
        setError(
          err instanceof Error
            ? `HEIC conversion failed: ${err.message}`
            : "Failed to convert HEIC file",
        );
        setIsProcessing(false);
      }
    },
    [resultUrl],
  );

  // -------------------------------------------------------------------------
  // Reset handler
  // -------------------------------------------------------------------------
  const handleReset = useCallback(() => {
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
    }
    setResultUrl(null);
    setOriginalFile(null);
    originalFileRef.current = null;
    setError(null);
  }, [resultUrl]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-4xl font-bold text-gray-900">BatchClear.io</h1>
      <p className="text-lg text-gray-600">
        Browser-native background removal
      </p>

      {/* Model progress (shown when model is not yet ready) */}
      {modelStatus !== "ready" && modelStatus !== "idle" && (
        <ModelProgress status={modelStatus} progress={downloadProgress} />
      )}

      {/* Model ready indicator (brief flash, then hides) */}
      {modelStatus === "ready" && !resultUrl && !isProcessing && (
        <ModelProgress status={modelStatus} progress={null} />
      )}

      {/* Error message */}
      {error && (
        <div className="w-full max-w-lg rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Drop zone (when idle, no result) */}
      {!resultUrl && !isProcessing && (
        <DropZone onFileDrop={handleFileDrop} disabled={modelStatus === "error"} />
      )}

      {/* Processing indicator */}
      {isProcessing && (
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
          <p className="text-sm font-medium text-gray-600">
            Removing background...
          </p>
        </div>
      )}

      {/* Result display */}
      {resultUrl && (
        <ResultView
          resultUrl={resultUrl}
          originalName={originalFile?.name ?? "image.png"}
          onReset={handleReset}
        />
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
