// ---------------------------------------------------------------------------
// Worker message protocol
// ---------------------------------------------------------------------------

/** Messages FROM main thread TO worker */
export type WorkerInMessage =
  | { type: "load-model" }
  | { type: "process"; imageId: string; imageData: Blob };

/** Messages FROM worker TO main thread */
export type WorkerOutMessage =
  | {
      type: "model-progress";
      status?: string;
      name?: string;
      file?: string;
      progress?: number;
      loaded?: number;
      total?: number;
      task?: string;
      model?: string;
    }
  | { type: "model-ready" }
  | { type: "model-error"; error: string }
  | { type: "inference-start"; imageId: string }
  | {
      type: "inference-complete";
      imageId: string;
      maskData: {
        data: Uint8ClampedArray;
        width: number;
        height: number;
        channels: number;
      };
    }
  | { type: "inference-error"; imageId: string; error: string };

// ---------------------------------------------------------------------------
// Convenience types for UI state
// ---------------------------------------------------------------------------

export type ModelStatus = "idle" | "downloading" | "ready" | "error";

export type DownloadProgress = {
  loaded: number;
  total: number;
};
