# Phase 1: Foundation + AI Pipeline - Research

**Researched:** 2026-02-19
**Domain:** Browser-based AI inference pipeline (Web Worker + ONNX + Canvas compositing)
**Confidence:** HIGH

## Summary

Phase 1 proves the end-to-end pipeline: user drops one image, gets back a background-removed PNG at full original resolution, with all inference running in a Web Worker with zero main-thread blocking. This phase is the riskiest part of the project -- it validates that `@huggingface/transformers` v3.8.x with RMBG-1.4 works correctly in a Vite-bundled Web Worker, that `coi-serviceworker` enables WASM multithreading on static hosting, and that Canvas compositing produces professional-quality full-resolution output.

The critical technical finding from this research is that the `background-removal` pipeline returns a **RawImage with RGBA channels where the background alpha is already set to transparent** -- NOT a raw grayscale mask. However, the output resolution matches the model's internal processing resolution (1024x1024 for RMBG-1.4), not the original image dimensions. Full-resolution output therefore requires: (1) extracting the alpha channel from the pipeline output, (2) resizing the mask to original dimensions, and (3) applying it to the original image via Canvas API. This compositing step is where the real quality comes from.

**Primary recommendation:** Build the Worker singleton with pipeline first, validate the exact output format with a real image, then build the compositor. The coi-serviceworker must be in place from the very first commit -- it affects performance by 3.4x and cannot be tested retroactively.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.x | UI framework | Latest stable. Hooks-based. |
| Vite | 7.3.x | Build tool + dev server | Native Web Worker support via `new URL()` pattern. Sub-second HMR. |
| TypeScript | 5.9.x | Type safety | Latest stable. NOT 6.0 beta. |
| Tailwind CSS | 4.2.x | Styling | v4 uses `@tailwindcss/vite` plugin -- zero PostCSS config. |
| @huggingface/transformers | 3.8.x | ML inference in browser | Only non-deprecated transformers.js package. v4 is preview-only. |
| briaai/RMBG-1.4 (q8 ONNX) | 1.4 | Background removal model | Only browser-compatible general-purpose bg-removal model. ~45MB quantized. |

### Supporting (Phase 1 only)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| coi-serviceworker | latest | COOP/COEP headers via service worker | Required from day one for WASM multithreading on GitHub Pages |
| vite-plugin-cross-origin-isolation | 0.1.x | Dev server COOP/COEP headers | Dev only -- enables `crossOriginIsolated` during `vite dev` |
| @tailwindcss/vite | 4.2.x | Tailwind CSS Vite plugin | Required for Tailwind v4 integration with Vite |
| @vitejs/plugin-react | 5.1.x | React Fast Refresh + JSX | SWC variant also acceptable |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `background-removal` pipeline | `image-segmentation` pipeline | `image-segmentation` requires manual mask extraction and post-processing. `background-removal` handles this internally. Use `background-removal`. |
| OffscreenCanvas for compositing | Regular `<canvas>` element | OffscreenCanvas works in Workers and avoids DOM. Safari 17+ supports 2D context. Use OffscreenCanvas on main thread; fall back to `<canvas>` only if needed. |
| Single worker | Worker pool (2 workers) | Two workers double model memory (~90MB). Single worker with sequential dispatch is sufficient for Phase 1. Pool can be added in Phase 2 if benchmarks justify it. |

**Installation (Phase 1):**
```bash
# Core
npm install react react-dom @huggingface/transformers

# Dev dependencies
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @tailwindcss/vite tailwindcss vite-plugin-cross-origin-isolation
```

## Architecture Patterns

### Recommended Project Structure (Phase 1 scope)

```
public/
  coi-serviceworker.js       # Must be separate file, NOT bundled
src/
  components/
    App.tsx                   # Root component
    DropZone.tsx              # Minimal drop zone (single image for Phase 1)
    ModelProgress.tsx         # Model download progress bar
    ResultView.tsx            # Show processed image result
  workers/
    inference.worker.ts       # Pipeline singleton + inference
  lib/
    compositor.ts             # Canvas API mask compositing
    types.ts                  # Shared TypeScript types
  main.tsx                    # Vite entry point
  index.css                   # @import "tailwindcss"
index.html                    # Includes coi-serviceworker script tag
vite.config.ts                # Plugins + base URL config
tsconfig.json                 # lib: ["ESNext", "DOM", "WebWorker"]
```

### Pattern 1: Web Worker with Pipeline Singleton

**What:** A singleton class inside a dedicated Web Worker that lazily initializes the `background-removal` pipeline exactly once. All subsequent inference calls reuse the same pipeline instance.

**When to use:** Always -- the RMBG-1.4 model is ~45MB. Loading it more than once wastes bandwidth and memory.

**Example:**
```typescript
// src/workers/inference.worker.ts
import { pipeline, env, RawImage } from "@huggingface/transformers";

// Configure for browser
env.allowLocalModels = false;

class PipelineSingleton {
  static instance: Promise<any> | null = null;

  static async getInstance(
    progressCallback?: (data: ProgressInfo) => void
  ) {
    this.instance ??= pipeline("background-removal", "briaai/RMBG-1.4", {
      dtype: "q8",
      progress_callback: progressCallback,
    });
    return this.instance;
  }
}

self.addEventListener("message", async (event) => {
  const { type, imageData, imageId } = event.data;

  if (type === "process") {
    try {
      const segmenter = await PipelineSingleton.getInstance((progress) => {
        self.postMessage({ type: "model-progress", ...progress });
      });

      self.postMessage({ type: "inference-start", imageId });

      // Pipeline returns RawImage[] with RGBA (background alpha = 0)
      const output = await segmenter(imageData);

      // output[0] is a RawImage at MODEL resolution (1024x1024)
      // Extract the raw pixel data for transfer to main thread
      const rawImage = output[0];
      const maskData = {
        data: rawImage.data,        // Uint8ClampedArray (RGBA)
        width: rawImage.width,
        height: rawImage.height,
        channels: rawImage.channels, // 4 (RGBA)
      };

      // Transfer the underlying buffer (zero-copy)
      self.postMessage(
        { type: "inference-complete", imageId, maskData },
        [maskData.data.buffer]
      );
    } catch (error: any) {
      self.postMessage({
        type: "inference-error",
        imageId,
        error: error.message,
      });
    }
  }
});
```
**Source:** Transformers.js official React tutorial pattern + PR #1216 background-removal pipeline

### Pattern 2: Vite Web Worker Import

**What:** Vite natively bundles Web Workers using the `new URL()` + `new Worker()` pattern.

**When to use:** Always when creating workers in Vite.

**Example:**
```typescript
// src/hooks/useWorker.ts or wherever worker is created
const worker = new Worker(
  new URL("../workers/inference.worker.ts", import.meta.url),
  { type: "module" }
);
```

**Important:** The `new URL()` call must be directly inside `new Worker()`. Vite statically analyzes this pattern -- it cannot be abstracted into a variable or function.

**Source:** [Vite Features docs - Web Workers section](https://vite.dev/guide/features)

### Pattern 3: Full-Resolution Canvas Compositing

**What:** The `background-removal` pipeline outputs at model resolution (1024x1024 for RMBG-1.4). To get full-resolution output, extract the alpha channel, resize the mask to original dimensions, and apply it to the original image via Canvas API.

**When to use:** Always -- this is the core quality differentiator.

**Example:**
```typescript
// src/lib/compositor.ts
export async function compositeFullResolution(
  originalBlob: Blob,
  pipelineOutput: { data: Uint8ClampedArray; width: number; height: number; channels: number }
): Promise<Blob> {
  // 1. Load original at full resolution
  const originalBitmap = await createImageBitmap(originalBlob);
  const { width: origW, height: origH } = originalBitmap;

  // 2. Extract alpha channel from pipeline output (RGBA, model resolution)
  // The pipeline output has 4 channels: R, G, B, A
  // The alpha channel contains the mask
  const maskCanvas = new OffscreenCanvas(pipelineOutput.width, pipelineOutput.height);
  const maskCtx = maskCanvas.getContext("2d")!;
  const maskImageData = new ImageData(
    new Uint8ClampedArray(pipelineOutput.data),
    pipelineOutput.width,
    pipelineOutput.height
  );
  maskCtx.putImageData(maskImageData, 0, 0);

  // 3. Scale mask to original dimensions
  const scaledMaskCanvas = new OffscreenCanvas(origW, origH);
  const scaledMaskCtx = scaledMaskCanvas.getContext("2d")!;
  scaledMaskCtx.drawImage(maskCanvas, 0, 0, origW, origH);
  const scaledMaskData = scaledMaskCtx.getImageData(0, 0, origW, origH);

  // 4. Draw original image at full resolution
  const outputCanvas = new OffscreenCanvas(origW, origH);
  const outputCtx = outputCanvas.getContext("2d")!;
  outputCtx.drawImage(originalBitmap, 0, 0);

  // 5. Apply mask alpha to original
  const outputData = outputCtx.getImageData(0, 0, origW, origH);
  const pixels = outputData.data;
  const maskPixels = scaledMaskData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    // Use the alpha channel from the mask
    pixels[i + 3] = maskPixels[i + 3];
  }

  outputCtx.putImageData(outputData, 0, 0);

  // 6. Export as PNG (preserves transparency)
  return outputCanvas.convertToBlob({ type: "image/png" });
}
```

**Critical note:** After compositing, immediately shrink the OffscreenCanvas to release memory:
```typescript
maskCanvas.width = 1;
maskCanvas.height = 1;
scaledMaskCanvas.width = 1;
scaledMaskCanvas.height = 1;
outputCanvas.width = 1;
outputCanvas.height = 1;
```

**Source:** Architecture research + MDN OffscreenCanvas docs + iOS Safari canvas memory ceiling pitfall

### Pattern 4: coi-serviceworker Setup

**What:** A service worker that injects COOP/COEP headers on static hosting (GitHub Pages) to enable `crossOriginIsolated`, which is required for `SharedArrayBuffer` and WASM multithreading.

**Setup:**
1. Download `coi-serviceworker.js` from the npm package or GitHub repo
2. Place in `public/coi-serviceworker.js` (Vite copies `public/` to `dist/` on build)
3. Add script tag in `index.html` BEFORE any other scripts:

```html
<!-- index.html -->
<head>
  <script src="coi-serviceworker.js"></script>
  <!-- ... other head content ... -->
</head>
```

4. For dev server, use `vite-plugin-cross-origin-isolation` to set headers natively:

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import crossOriginIsolation from "vite-plugin-cross-origin-isolation";

export default defineConfig({
  plugins: [react(), tailwindcss(), crossOriginIsolation()],
  base: "/BatchClear.io/", // GitHub Pages repo name
});
```

**Caveats:**
- First page load triggers a reload (service worker must install first) -- one-time cost
- The JS file MUST be served from same origin, not bundled, not from CDN
- Safari WASM multithreading has a separate bug (DataCloneError with SharedArrayBuffer). Force `numThreads = 1` on Safari:

```typescript
// Inside worker, before pipeline creation
import { env } from "@huggingface/transformers";
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
if (isSafari) {
  env.backends.onnx.wasm.numThreads = 1;
}
```

**Source:** [coi-serviceworker repo](https://github.com/gzuidhof/coi-serviceworker) + [ONNX Runtime Safari issue #11567](https://github.com/microsoft/onnxruntime/issues/11567)

### Pattern 5: Model Download Progress Tracking

**What:** The `progress_callback` option on the pipeline constructor receives events with discriminated union types. Use these to show download progress to the user.

**Progress event types:**
```typescript
// Types from @huggingface/transformers
type ProgressInfo =
  | { status: "initiate"; name: string; file: string }
  | { status: "download"; name: string; file: string }
  | { status: "progress"; name: string; file: string; progress: number; loaded: number; total: number }
  | { status: "done"; name: string; file: string }
  | { status: "ready"; task: string; model: string };
```

**Worker-side forwarding:**
```typescript
// In worker: forward progress to main thread
const segmenter = await PipelineSingleton.getInstance((progress) => {
  self.postMessage({ type: "model-progress", ...progress });
});
```

**Main-thread handling for download progress UI:**
```typescript
// Accumulate loaded bytes across all model files
worker.onmessage = (event) => {
  const { type, status, loaded, total, file } = event.data;
  if (type === "model-progress" && status === "progress") {
    // Track per-file progress, sum across files for total
    fileProgress.set(file, { loaded, total });
    const totalLoaded = [...fileProgress.values()].reduce((s, f) => s + f.loaded, 0);
    const totalSize = [...fileProgress.values()].reduce((s, f) => s + f.total, 0);
    setDownloadProgress({ loaded: totalLoaded, total: totalSize });
  }
  if (type === "model-progress" && status === "ready") {
    setModelReady(true);
  }
};
```

**Known issue:** The `progressInfo` sometimes lacks `status`, `name`, and `file` attributes during download (GitHub issue #1401). Guard with optional chaining.

**Source:** [@huggingface/transformers type definitions](https://app.unpkg.com/@huggingface/transformers@3.7.6/files/types/utils/core.d.ts) + [GitHub issue #1401](https://github.com/huggingface/transformers.js/issues/1401)

### Anti-Patterns to Avoid

- **Importing @huggingface/transformers on main thread:** Only import in the worker. Main thread communicates via postMessage. Importing on both sides doubles the bundle.
- **Creating a new Worker per image:** Each worker loads its own copy of the ~45MB model. Use a single long-lived worker.
- **Using `toDataURL()` instead of `convertToBlob()`:** Data URLs are ~33% larger (base64), double memory usage, and can exceed URL length limits. Always use Blob URLs.
- **Not shrinking canvases after use:** On iOS Safari, canvas memory (~224-384 MB ceiling) accumulates. Set `canvas.width = 1; canvas.height = 1` after extracting the Blob.
- **Using `image-segmentation` pipeline instead of `background-removal`:** The `background-removal` pipeline (added in v3.4.0) handles mask generation internally. Less code, fewer bugs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| COOP/COEP headers on static hosting | Custom service worker for header injection | `coi-serviceworker` | Battle-tested, handles edge cases (SW update, reload logic, deregistration). 100+ dependents. |
| Cross-origin isolation in dev server | Manual Vite middleware for headers | `vite-plugin-cross-origin-isolation` | One-line plugin. Handles HMR websocket CORS correctly. |
| Model download progress | Custom fetch wrapper around ONNX file downloads | `progress_callback` option on `pipeline()` | Transformers.js handles Cache API, retry logic, and multi-file progress internally. |
| Image loading from Blob/File | Manual FileReader + Image element chain | `createImageBitmap(blob)` | Browser-native, works in workers, handles EXIF orientation in modern browsers. Returns ImageBitmap directly. |
| Transferring large image data to/from worker | JSON serialization or structured clone | Transferable ArrayBuffer | Zero-copy transfer (~6ms vs 200-300ms for a 4K image). Critical for performance. |

**Key insight:** The `background-removal` pipeline in `@huggingface/transformers` handles model loading, caching, preprocessing, inference, and basic postprocessing. The only custom code needed is: (1) the worker message protocol, (2) mask-to-full-resolution compositing via Canvas, and (3) the progress UI.

## Common Pitfalls

### Pitfall 1: Pipeline Output Resolution vs Original Resolution

**What goes wrong:** Developers call `pipeline("background-removal", ...)` and assume the output is at the original image resolution. It is not -- RMBG-1.4 processes internally at 1024x1024. The pipeline returns a RawImage at model resolution with RGBA channels (alpha = 0 for background).

**Why it happens:** The pipeline API is simple (`const output = await segmenter(image)`) and the output is a valid image. Without checking dimensions, developers ship downscaled results.

**How to avoid:** Always extract the alpha channel from the pipeline output, resize to original dimensions using Canvas `drawImage()` scaling, and apply to the original image pixel-by-pixel. This is the compositor pattern documented above.

**Warning signs:** Output images are always 1024x1024 regardless of input. Quality looks "soft" or "blurry" on high-resolution inputs.

### Pitfall 2: iOS Safari Canvas Memory Ceiling

**What goes wrong:** iOS Safari enforces ~224-384 MB total canvas memory. Each full-res canvas uses `width * height * 4` bytes. A 4000x3000 image = ~48 MB per canvas. Creating multiple canvases for compositing without releasing them crashes the tab silently.

**Why it happens:** Desktop Chrome has no practical canvas memory limit. Developers never encounter this during development.

**How to avoid:** Reuse OffscreenCanvas instances. After extracting a Blob via `convertToBlob()`, immediately shrink: `canvas.width = 1; canvas.height = 1`. Display results via `<img src={blobUrl}>`, never via live canvases.

**Warning signs:** White/blank canvases after processing several images. Tab crash on real iPhone (not Chrome DevTools simulation).

### Pitfall 3: Missing coi-serviceworker = 3.4x Slower Inference

**What goes wrong:** ONNX Runtime Web falls back to single-threaded WASM when `crossOriginIsolated === false`. No error is thrown -- inference still works, just 3.4x slower.

**Why it happens:** Vite dev server can set COOP/COEP headers natively (via plugin). Everything works fast in development. On GitHub Pages, headers cannot be set, so `SharedArrayBuffer` is unavailable and multithreading silently degrades.

**How to avoid:** Include `coi-serviceworker.js` in `public/` from the first commit. Verify `crossOriginIsolated === true` in browser console on every deployment. Accept the one-time page reload on first visit.

**Warning signs:** `crossOriginIsolated` returns `false` in production. Inference 3-4x slower on deployed site vs local.

### Pitfall 4: Safari WASM Multithreading DataCloneError

**What goes wrong:** Even WITH `crossOriginIsolated === true`, Safari throws `DataCloneError: The object can not be cloned` during ONNX inference when using SharedArrayBuffer with WASM threads.

**Why it happens:** A bug in Safari's implementation of structured clone for SharedArrayBuffer in WASM contexts. Documented in ONNX Runtime issue #11567.

**How to avoid:** Detect Safari/WebKit user agent and force single-threaded mode: `env.backends.onnx.wasm.numThreads = 1`. This makes Safari slower but functional.

**Warning signs:** App crashes on Safari with DataCloneError in production only (not in Chrome).

### Pitfall 5: Web Worker WASM Memory Leak on Termination

**What goes wrong:** Terminating a Web Worker running ONNX/WASM inference does not reliably free WASM linear memory. Memory accumulates if workers are created/terminated repeatedly.

**Why it happens:** Browser GCs treat WASM memory as opaque ArrayBuffers. Documented bugs in Chromium (356205) and Firefox (987799).

**How to avoid:** Create the worker ONCE at app initialization. Reuse for all images across the entire session. Never call `worker.terminate()` during normal operation.

**Warning signs:** Browser memory growing with each processed image in Task Manager.

### Pitfall 6: progress_callback Missing Fields

**What goes wrong:** The `progress_callback` sometimes receives events where `status`, `name`, or `file` are undefined, causing crashes in progress tracking code.

**Why it happens:** Known issue in transformers.js (GitHub issue #1401). Some intermediate events lack required fields.

**How to avoid:** Guard all field access with optional chaining: `progress?.status`, `progress?.loaded ?? 0`, `progress?.total ?? 0`. Only update UI when `status === "progress"` AND `loaded` and `total` are defined numbers.

## Code Examples

### Complete Vite Configuration (Phase 1)

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import crossOriginIsolation from "vite-plugin-cross-origin-isolation";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    crossOriginIsolation(),
  ],
  base: "/BatchClear.io/",
  worker: {
    format: "es",
  },
});
```

### Tailwind CSS v4 Setup

```css
/* src/index.css */
@import "tailwindcss";

/* Custom theme variables if needed */
@theme {
  --color-primary: oklch(0.65 0.15 250);
}
```

No `tailwind.config.js` needed. Tailwind v4 reads configuration from CSS.

### index.html with coi-serviceworker

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BatchClear.io</title>
    <!-- MUST be before any other scripts -->
    <script src="coi-serviceworker.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### Worker Message Protocol (TypeScript types)

```typescript
// src/lib/types.ts

// Messages FROM main thread TO worker
export type WorkerInMessage =
  | { type: "process"; imageId: string; imageData: Blob }

// Messages FROM worker TO main thread
export type WorkerOutMessage =
  | { type: "model-progress"; status: string; name?: string; file?: string;
      progress?: number; loaded?: number; total?: number; task?: string; model?: string }
  | { type: "inference-start"; imageId: string }
  | { type: "inference-complete"; imageId: string;
      maskData: { data: Uint8ClampedArray; width: number; height: number; channels: number } }
  | { type: "inference-error"; imageId: string; error: string }

// Model loading state
export type ModelStatus = "idle" | "downloading" | "ready" | "error";

// Download progress tracking
export type DownloadProgress = {
  loaded: number;  // bytes downloaded
  total: number;   // total bytes
  percent: number; // 0-100
};
```

### Transferable Objects for Zero-Copy Transfer

```typescript
// Sending image data TO worker (main thread)
const arrayBuffer = await file.arrayBuffer();
worker.postMessage(
  { type: "process", imageId: id, imageData: arrayBuffer },
  [arrayBuffer] // Transfer, not clone
);

// Receiving mask data FROM worker (worker side)
self.postMessage(
  { type: "inference-complete", imageId, maskData },
  [maskData.data.buffer] // Transfer the underlying buffer
);
```

**Important:** After transferring an ArrayBuffer, the sender can no longer access it (it becomes "neutered"). This is by design -- it enforces zero-copy semantics.

### Verifying crossOriginIsolated

```typescript
// Add to App.tsx in development, or as a startup check
if (typeof crossOriginIsolated !== "undefined") {
  console.log("crossOriginIsolated:", crossOriginIsolated);
  if (!crossOriginIsolated) {
    console.warn(
      "SharedArrayBuffer not available. WASM multithreading disabled. " +
      "Inference will be ~3.4x slower."
    );
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@xenova/transformers` v2 | `@huggingface/transformers` v3.8.x | 2024 | Package renamed. `@xenova` is deprecated and unmaintained. |
| `image-segmentation` pipeline + manual mask | `background-removal` pipeline | v3.4.0 (March 2025) | Dedicated pipeline handles mask generation internally. Less code. |
| JSZip for ZIP generation | fflate v0.8 | Ongoing | 40x faster, true async, 8kB. JSZip blocks main thread. (Phase 3 concern) |
| Manual COOP/COEP header config | `coi-serviceworker` | Ongoing | Standard solution for static hosting without header control. |
| Tailwind CSS v3 with `tailwind.config.js` | Tailwind CSS v4 with `@import "tailwindcss"` in CSS | Jan 2025 | Zero-config. No config file needed. 5-100x faster builds. |
| ESLint `.eslintrc` format | ESLint flat config `eslint.config.js` | ESLint 9+ | Legacy format removed in ESLint 10. Use flat config only. |

**Deprecated/outdated:**
- `@xenova/transformers`: Last release 2+ years ago. No WebGPU support. No bug fixes. Do NOT use.
- RMBG-2.0 in browser: Known onnxruntime-web bug prevents execution. 513MB fp16, no quantized variant. Do NOT use.
- JSZip: Last published 4+ years ago. Blocks main thread. Use fflate for Phase 3.

## Open Questions

1. **Exact pipeline output format with RMBG-1.4 specifically**
   - What we know: The `background-removal` pipeline returns `RawImage[]` with RGBA channels. Alpha = 0 for background. Resolution is model-internal (1024x1024 for RMBG-1.4). PR #1216 confirms mask-based approach.
   - What's unclear: Issue #1230 reported a bug where some models output 50% opacity (alpha = 127) instead of 0. This was fixed in PR #1255, but should be verified with the exact model+version combination we use.
   - Recommendation: First task in Phase 1 should be a spike that calls the pipeline in a worker and logs the exact output: `rawImage.width`, `rawImage.height`, `rawImage.channels`, and sample alpha values from known-background regions. This takes 30 minutes and eliminates the biggest unknown.

2. **Safari EXIF orientation with `drawImage()`**
   - What we know: Modern browsers (2024+) auto-apply EXIF orientation in `<img>` tags. But `drawImage()` behavior varies -- some browsers apply EXIF automatically, others do not.
   - What's unclear: Does `createImageBitmap()` (which we use for compositing) respect EXIF orientation? If so, no manual handling needed. If not, iPhone portrait photos will appear rotated.
   - Recommendation: Test during Phase 1 compositing with a real iPhone portrait photo. If `createImageBitmap` handles orientation, no extra code needed. If not, use the `imageOrientation: "flipY"` option on `createImageBitmap` or read EXIF manually.

3. **OffscreenCanvas `convertToBlob()` support across browsers**
   - What we know: Safari 17+ supports OffscreenCanvas with 2D context. Chrome 69+ fully supports it.
   - What's unclear: Does Safari support `convertToBlob()` on OffscreenCanvas specifically? Some implementations may only support `transferToImageBitmap()`.
   - Recommendation: Use OffscreenCanvas for compositing (it works on main thread too, not just workers). If `convertToBlob()` fails on any target browser, fall back to creating a regular `<canvas>` element, drawing to it, and using `canvas.toBlob()`.

4. **Model file count and total download size**
   - What we know: RMBG-1.4 at q8 quantization is ~45MB total. Transformers.js downloads multiple files (model weights, config, tokenizer, etc.).
   - What's unclear: Exactly how many files are downloaded and their individual sizes. This affects progress bar accuracy -- we need to aggregate across files.
   - Recommendation: The progress tracking pattern using a Map of file progress (documented in Pattern 5 above) handles this. Log all progress events during the spike to understand the exact file breakdown.

## Sources

### Primary (HIGH confidence)
- [Transformers.js RawImage API docs](https://huggingface.co/docs/transformers.js/api/utils/image) -- RawImage constructor accepts `(data, width, height, channels)`. Has `resize()`, `rgba()`, `putAlpha()` methods.
- [Transformers.js Pipeline API docs](https://huggingface.co/docs/transformers.js/api/pipelines) -- `pipeline("background-removal", model, options)` returns array of RawImage
- [Background-Removal Pipeline PR #1216](https://github.com/huggingface/transformers.js/pull/1216) -- Confirms pipeline returns mask/segmentation output as RawImage, supports 17+ models
- [Transformers.js v3.4.0 Release](https://github.com/huggingface/transformers.js/releases/tag/3.4.0) -- Confirms `background-removal` pipeline introduction
- [Issue #1230: 50% opacity bug](https://github.com/huggingface/transformers.js/issues/1230) -- Fixed in PR #1255. Was ONNX Runtime sigmoid bug in WASM backend.
- [@huggingface/transformers type definitions (core.d.ts)](https://app.unpkg.com/@huggingface/transformers@3.7.6/files/types/utils/core.d.ts) -- ProgressInfo union type with 5 status variants
- [Issue #1401: progress_callback missing fields](https://github.com/huggingface/transformers.js/issues/1401) -- Known issue, guard with optional chaining
- [coi-serviceworker repo](https://github.com/gzuidhof/coi-serviceworker) -- Setup: separate file in same origin, script tag in head, one-time reload
- [Vite Features docs - Web Workers](https://vite.dev/guide/features) -- `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` pattern
- [MDN: OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) -- Supported in Safari 17+, 2D context only
- [CanIUse: OffscreenCanvas](https://caniuse.com/offscreencanvas) -- Full support Safari 17+, Chrome 69+
- [Tailwind CSS v4 + Vite setup](https://tailwindcss.com/docs) -- `@tailwindcss/vite` plugin + `@import "tailwindcss"` in CSS
- [vite-plugin-cross-origin-isolation](https://github.com/chaosprint/vite-plugin-cross-origin-isolation) -- Dev server COOP/COEP headers

### Secondary (MEDIUM confidence)
- [ONNX Runtime Safari issue #11567](https://github.com/microsoft/onnxruntime/issues/11567) -- Safari DataCloneError with SharedArrayBuffer
- [Thomas Steiner: COOP/COEP on static hosting](https://blog.tomayac.com/2025/03/08/setting-coop-coep-headers-on-static-hosting-like-github-pages/) -- Confirms coi-serviceworker as standard solution
- [Addy Osmani bg-remove](https://github.com/addyosmani/bg-remove) -- Reference implementation confirming React + Transformers.js + RMBG-1.4 approach
- [Wes Bos bg-remover](https://github.com/wesbos/bg-remover) -- Reference implementation confirming Web Worker + Canvas compositing pattern
- [PQINA: iOS Safari canvas memory](https://pqina.nl/blog/total-canvas-memory-use-exceeds-the-maximum-limit) -- Canvas memory ceiling documentation
- [Chromium Bug 356205](https://bugs.chromium.org/p/chromium/issues/detail?id=356205) -- WASM memory leak on worker termination

### Tertiary (LOW confidence)
- Pipeline output being RGBA with pre-applied alpha (not raw grayscale mask): Based on PR #1216 description and issue #1230 behavior. Needs validation with actual RMBG-1.4 output in the spike task.
- Exact model download file count and sizes: Based on general transformers.js behavior (~45MB total from prior research). Exact file breakdown needs runtime verification.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All versions verified against npm registries. `@huggingface/transformers` v3.8.x + RMBG-1.4 q8 is the only working combination for browser.
- Architecture: HIGH -- Pipeline singleton, Web Worker isolation, Canvas compositing all confirmed by official docs and multiple reference implementations.
- Pitfalls: HIGH -- All critical pitfalls verified against browser bug trackers, GitHub issues, and official documentation.
- Pipeline output format: MEDIUM -- PR #1216 confirms mask-based output, but exact RGBA structure with RMBG-1.4 specifically needs runtime validation.

**Research date:** 2026-02-19
**Valid until:** ~2026-03-19 (30 days -- stack is stable, but check for transformers.js minor releases)
