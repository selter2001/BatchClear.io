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

// ---------------------------------------------------------------------------
// Batch processing types
// ---------------------------------------------------------------------------

export type ImageStatus = "idle" | "queued" | "processing" | "done" | "error";
export type BackgroundMode = "transparent" | "white";

export interface ImageItem {
  id: string;
  file: File;               // Original file (or HEIC-converted JPEG)
  name: string;              // Original filename for display
  status: ImageStatus;
  error?: string;
  originalUrl: string;       // Blob URL for original preview
  resultUrl?: string;        // Blob URL for transparent PNG result
  resultWhiteUrl?: string;   // Blob URL for white-background JPG result
}

export interface BatchState {
  images: ImageItem[];
  backgroundMode: BackgroundMode;
}

export type BatchAction =
  | { type: "ADD_IMAGES"; items: ImageItem[] }
  | { type: "SET_QUEUED"; id: string }
  | { type: "SET_PROCESSING"; id: string }
  | { type: "SET_DONE"; id: string; resultUrl: string; resultWhiteUrl: string }
  | { type: "SET_ERROR"; id: string; error: string }
  | { type: "RETRY"; id: string }
  | { type: "REMOVE"; id: string }
  | { type: "SET_BACKGROUND_MODE"; mode: BackgroundMode }
  | { type: "CLEAR_ALL" };
