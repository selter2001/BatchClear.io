// ---------------------------------------------------------------------------
// Inference Worker -- RMBG-1.4 background-removal pipeline
// ---------------------------------------------------------------------------
// Runs entirely off the main thread. Communicates via typed postMessage
// protocol defined in src/lib/types.ts.
// ---------------------------------------------------------------------------

import {
  env,
  pipeline,
  RawImage,
} from "@huggingface/transformers";
import type { WorkerInMessage, WorkerOutMessage } from "../lib/types";

// Disable local model loading -- always fetch from Hugging Face Hub.
env.allowLocalModels = false;

// ---------------------------------------------------------------------------
// Safari WASM thread workaround
// ---------------------------------------------------------------------------
// Safari's WebKit engine triggers a DataCloneError when ONNX Runtime tries to
// send data between WASM threads (onnxruntime issue #11567). Forcing
// numThreads = 1 avoids the multi-threaded code path entirely.
// ---------------------------------------------------------------------------
const isSafari =
  typeof navigator !== "undefined" &&
  /Safari/.test(navigator.userAgent) &&
  !/Chrome|Android/.test(navigator.userAgent);

if (isSafari && env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
}

// ---------------------------------------------------------------------------
// Pipeline singleton
// ---------------------------------------------------------------------------
// The model is ~30-40 MB (q8) and takes several seconds to download + compile.
// We create the pipeline exactly once and reuse it for every inference call.
// ---------------------------------------------------------------------------

// We use `any` for the segmenter callable because @huggingface/transformers
// produces a union type too complex for TS to represent when fully typed.
// The runtime types are well-known: input is Blob/URL, output is array of
// segmentation results containing RawImage masks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Segmenter = (input: any) => Promise<any>;

type ProgressFn = (info: Record<string, unknown>) => void;

class PipelineSingleton {
  static instance: Promise<Segmenter> | null = null;

  static getInstance(progressCallback?: ProgressFn): Promise<Segmenter> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts: any = { dtype: "q8" };
    if (progressCallback) {
      opts.progress_callback = progressCallback;
    }
    this.instance ??= pipeline(
      "image-segmentation",
      "briaai/RMBG-1.4",
      opts,
    ) as unknown as Promise<Segmenter>;
    return this.instance;
  }
}

// ---------------------------------------------------------------------------
// Typed postMessage helper
// ---------------------------------------------------------------------------

function post(message: WorkerOutMessage, transfer?: Transferable[]) {
  if (transfer) {
    self.postMessage(message, transfer);
  } else {
    self.postMessage(message);
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.addEventListener("message", async (e: MessageEvent<WorkerInMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    // -----------------------------------------------------------------
    // Proactive model loading (before user drops an image)
    // -----------------------------------------------------------------
    case "load-model": {
      try {
        await PipelineSingleton.getInstance((progress) => {
          // Forward raw progress events to main thread.
          // We treat `progress` as Record<string, unknown> because the
          // callback shape is a discriminated union that varies across
          // HF transformers versions (see issue #1401). Extracting fields
          // with fallback defaults is the safest approach.
          const p = progress as Record<string, unknown>;
          post({
            type: "model-progress",
            status: p.status as string | undefined,
            name: p.name as string | undefined,
            file: p.file as string | undefined,
            progress: p.progress as number | undefined,
            loaded: (p.loaded as number) ?? 0,
            total: (p.total as number) ?? 0,
            task: p.task as string | undefined,
            model: p.model as string | undefined,
          });
        });
        post({ type: "model-ready" });
      } catch (err) {
        post({
          type: "model-error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    // -----------------------------------------------------------------
    // Image inference
    // -----------------------------------------------------------------
    case "process": {
      const { imageId, imageData } = msg;

      try {
        post({ type: "inference-start", imageId });

        // Ensure model is loaded (no-op if already loaded)
        const segmenter = await PipelineSingleton.getInstance();

        // Run inference -- pipeline accepts Blob directly
        const output = await segmenter(imageData);

        // Extract the first (and only) segmentation result as RawImage.
        // The pipeline returns an array; element 0 is the mask.
        const result = Array.isArray(output) ? output[0] : output;
        const mask = result?.mask;

        if (!(mask instanceof RawImage)) {
          throw new Error(
            "Unexpected pipeline output: mask is not a RawImage",
          );
        }

        const maskData = {
          data: new Uint8ClampedArray(mask.data),
          width: mask.width,
          height: mask.height,
          channels: mask.channels,
        };

        // Zero-copy transfer of the underlying ArrayBuffer
        post(
          { type: "inference-complete", imageId, maskData },
          [maskData.data.buffer],
        );
      } catch (err) {
        post({
          type: "inference-error",
          imageId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }
  }
});
