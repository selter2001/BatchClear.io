# Architecture Research

**Domain:** Client-side batch image processing with in-browser AI
**Researched:** 2026-02-19
**Confidence:** HIGH

## System Overview

```
+------------------------------------------------------------------+
|                         UI Layer (React)                         |
|  +------------+  +-------------+  +----------+  +------------+  |
|  | DropZone   |  | ImageGrid   |  | Controls |  | DownloadBar|  |
|  | (upload)   |  | (previews + |  | (bg mode |  | (ZIP       |  |
|  |            |  |  progress)  |  |  + theme)|  |  download)  |  |
|  +-----+------+  +------+------+  +----+-----+  +-----+------+  |
|        |                |               |              |         |
+--------+----------------+---------------+--------------+---------+
         |                |               |              |
+--------v----------------v---------------v--------------v---------+
|                    State Layer (Zustand Store)                    |
|  +----------+  +-------------+  +------------+  +----------+    |
|  | images[] |  | queue state |  | settings   |  | model    |    |
|  | (status, |  | (pending,   |  | (bg mode,  |  | (loading,|    |
|  |  result) |  |  active)    |  |  theme)    |  |  ready)  |    |
|  +----------+  +------+------+  +------------+  +----------+    |
+------------------------+----------------------------------------+
                         |
+------------------------v----------------------------------------+
|                 Processing Layer (Queue Manager)                 |
|  +------------------------------------------------------------+ |
|  | Concurrency Controller (max 2 simultaneous)                 | |
|  |   - Picks next pending image from queue                    | |
|  |   - Dispatches to Worker                                   | |
|  |   - On completion: updates store, starts next              | |
|  +------------------------+-----------------------------------+ |
+---------------------------|-------------------------------------+
                            |  postMessage / onmessage
+---------------------------v-------------------------------------+
|                    Worker Layer (Web Worker)                      |
|  +------------------------------------------------------------+ |
|  | Pipeline Singleton                                          | |
|  |   - Loads @huggingface/transformers once                   | |
|  |   - Caches RMBG-1.4 pipeline instance                     | |
|  |   - Reports download progress via postMessage              | |
|  +------------------------------------------------------------+ |
|  +------------------------------------------------------------+ |
|  | Inference Engine                                            | |
|  |   - Receives image data (Blob/ArrayBuffer)                 | |
|  |   - Runs background-removal pipeline                       | |
|  |   - Returns RawImage mask data                             | |
|  +------------------------------------------------------------+ |
+------------------------+----------------------------------------+
                         |  mask data back to main thread
+------------------------v----------------------------------------+
|                 Compositing Layer (Canvas API)                    |
|  +------------------------------------------------------------+ |
|  | Full-Resolution Compositor                                  | |
|  |   - Creates OffscreenCanvas at original image dimensions   | |
|  |   - Draws original image                                   | |
|  |   - Applies mask to alpha channel (pixel-level)            | |
|  |   - Optionally composites white background (JPG mode)      | |
|  |   - Exports to Blob (PNG or JPG)                           | |
|  +------------------------------------------------------------+ |
+------------------------+----------------------------------------+
                         |
+------------------------v----------------------------------------+
|                  Output Layer                                    |
|  +--------------------+  +-----------------------------------+  |
|  | Individual Download |  | Batch ZIP (JSZip)                |  |
|  | (single file save)  |  | (collects all Blobs, generates  |  |
|  +--------------------+  |  ZIP, triggers download)          |  |
|                          +-----------------------------------+  |
+-----------------------------------------------------------------+
```

## Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| DropZone | Accepts drag-and-drop or click-to-browse file input; validates file types and count (max 100); creates File references | React component wrapping `<input type="file">` with drag events |
| ImageGrid | Displays thumbnail previews with per-image status badges (Waiting / Processing / Done / Error) and individual progress bars | React component mapping over images array from store |
| Controls | Background mode toggle (Transparent PNG vs White JPG); theme toggle (dark/light); "Process All" trigger | Stateless React controls bound to store actions |
| DownloadBar | "Download All as ZIP" button; shows ZIP generation progress | React component calling JSZip on all completed results |
| Zustand Store | Single source of truth for all application state; images array, queue state, model readiness, user settings | Zustand store with slice pattern (imageSlice, settingsSlice, modelSlice) |
| Queue Manager | Concurrency controller limiting to 2 simultaneous worker tasks; picks next pending image, dispatches to worker, handles completion/error | Plain TypeScript module (not React); uses store subscriptions |
| Web Worker | Loads and caches the ML pipeline singleton; runs inference off the main thread; reports progress via postMessage | Dedicated `worker.ts` file with singleton pipeline class |
| Compositor | Applies AI-generated mask onto original full-resolution image using Canvas API pixel manipulation; handles both transparent and white-background modes | Utility function using `OffscreenCanvas` or `<canvas>` element |
| ZIP Builder | Collects all processed image Blobs and packages them into a downloadable ZIP file | JSZip library generating in-memory ZIP |

## Recommended Project Structure

```
src/
+-- components/          # React UI components
|   +-- DropZone.tsx     # File upload area with drag-and-drop
|   +-- ImageGrid.tsx    # Grid of image cards with status
|   +-- ImageCard.tsx    # Single image preview + progress
|   +-- Controls.tsx     # Background mode, theme toggle
|   +-- DownloadBar.tsx  # ZIP download trigger
|   +-- Header.tsx       # App title, description
|   +-- Footer.tsx       # Attribution, links
|   +-- ProgressBar.tsx  # Reusable progress bar component
|   +-- ThemeToggle.tsx  # Dark/light toggle
+-- store/               # Zustand state management
|   +-- index.ts         # Combined store
|   +-- imageSlice.ts    # Image list state + actions
|   +-- settingsSlice.ts # Theme, background mode
|   +-- modelSlice.ts    # Model loading state
+-- workers/             # Web Worker scripts
|   +-- inference.worker.ts  # ML pipeline singleton + inference
+-- lib/                 # Pure logic, no React dependency
|   +-- queue.ts         # Concurrency queue manager
|   +-- compositor.ts    # Canvas API mask compositing
|   +-- zip.ts           # JSZip batch download builder
|   +-- types.ts         # Shared TypeScript types
+-- hooks/               # Custom React hooks
|   +-- useWorker.ts     # Worker lifecycle + message handling
|   +-- useQueue.ts      # Queue orchestration hook
+-- App.tsx              # Root component, layout
+-- main.tsx             # Vite entry point
+-- index.css            # Tailwind directives + global styles
```

### Structure Rationale

- **components/:** One file per visual component. ImageCard is separated from ImageGrid because each card has its own progress state and interaction (individual download, retry).
- **store/:** Slice pattern keeps state modular. imageSlice manages the array of images and their status transitions. settingsSlice holds user preferences. modelSlice tracks pipeline readiness.
- **workers/:** Isolated from React. The worker file imports only `@huggingface/transformers` and communicates via postMessage -- no React, no store, no DOM.
- **lib/:** Framework-agnostic logic. The queue manager, compositor, and ZIP builder have zero React imports, making them testable and reusable. This is where the core business logic lives.
- **hooks/:** Bridge between lib/ and components/. `useWorker` manages Worker lifecycle and translates postMessage events into store updates. `useQueue` wires the concurrency controller to React lifecycle.

## Architectural Patterns

### Pattern 1: Pipeline Singleton in Web Worker

**What:** A class with a static `getInstance()` method that lazily initializes the Transformers.js pipeline exactly once. All subsequent calls reuse the same instance. This lives inside the Web Worker, completely isolated from the main thread.

**When to use:** Always -- the RMBG-1.4 model is approximately 45MB. Loading it more than once wastes bandwidth and memory.

**Trade-offs:** First inference is slow (model download + ONNX warmup). All subsequent inferences are fast. The singleton pattern means model is never garbage collected while the worker lives, which is acceptable for this app's lifecycle.

**Example:**
```typescript
// workers/inference.worker.ts
import { pipeline, env } from "@huggingface/transformers";

// Configure Transformers.js for browser usage
env.allowLocalModels = false;

class BackgroundRemovalPipeline {
  static task = "background-removal" as const;
  static model = "briaai/RMBG-1.4";
  static instance: Promise<any> | null = null;

  static async getInstance(progressCallback?: (data: any) => void) {
    this.instance ??= pipeline(this.task, this.model, {
      dtype: "q8",  // 8-bit quantized for browser, ~45MB
      progress_callback: progressCallback,
    });
    return this.instance;
  }
}

self.addEventListener("message", async (event) => {
  const { type, imageData, imageId } = event.data;

  if (type === "process") {
    try {
      const segmenter = await BackgroundRemovalPipeline.getInstance(
        (progress) => self.postMessage({ type: "model-progress", ...progress })
      );
      self.postMessage({ type: "inference-start", imageId });

      const result = await segmenter(imageData);
      // Transfer the result back (RawImage data)
      self.postMessage({ type: "inference-complete", imageId, result });
    } catch (error) {
      self.postMessage({ type: "inference-error", imageId, error: error.message });
    }
  }
});
```

### Pattern 2: Concurrency Queue with Fixed Worker Pool

**What:** A queue manager that processes at most N images simultaneously. When an image completes, the next pending image is automatically dequeued. The queue sits in the main thread and dispatches work to the Web Worker.

**When to use:** Always -- processing 100 images simultaneously would crash the browser tab due to memory exhaustion. With RMBG-1.4, each inference uses significant memory for the tensor operations.

**Trade-offs:** Max concurrency of 2 is conservative but safe. With a single worker and sequential processing within the worker, the "concurrency" is achieved by having the queue dispatch the next image as soon as the previous one finishes, keeping the pipeline warm. An alternative is spawning 2 separate workers, but this doubles model memory (~90MB total) for marginal throughput gain. Use a single worker with sequential dispatch unless benchmarking proves otherwise.

**Example:**
```typescript
// lib/queue.ts
type QueueItem = {
  imageId: string;
  imageData: Blob;
};

export class ProcessingQueue {
  private pending: QueueItem[] = [];
  private activeCount = 0;
  private maxConcurrent: number;
  private processItem: (item: QueueItem) => Promise<void>;

  constructor(maxConcurrent: number, processItem: (item: QueueItem) => Promise<void>) {
    this.maxConcurrent = maxConcurrent;
    this.processItem = processItem;
  }

  enqueue(item: QueueItem) {
    this.pending.push(item);
    this.tryProcessNext();
  }

  private async tryProcessNext() {
    while (this.activeCount < this.maxConcurrent && this.pending.length > 0) {
      const item = this.pending.shift()!;
      this.activeCount++;
      this.processItem(item).finally(() => {
        this.activeCount--;
        this.tryProcessNext();
      });
    }
  }

  clear() {
    this.pending = [];
  }

  get pendingCount() { return this.pending.length; }
  get isProcessing() { return this.activeCount > 0; }
}
```

### Pattern 3: Full-Resolution Canvas Compositing

**What:** After the AI model generates a segmentation mask (which may be at a reduced resolution, typically 1024x1024 for RMBG-1.4), the mask is scaled back to the original image dimensions and applied pixel-by-pixel to the alpha channel. This preserves full original quality.

**When to use:** Always -- this is the core quality differentiator. Without this step, output images would be limited to the model's internal resolution.

**Trade-offs:** Pixel-level manipulation via getImageData/putImageData can be slow for very large images (e.g., 8000x6000). For typical web images (up to 4000x3000), it completes in milliseconds. The operation happens on the main thread but is CPU-only and fast enough to not cause jank.

**Example:**
```typescript
// lib/compositor.ts
export type BackgroundMode = "transparent" | "white";

export async function compositeImage(
  originalBlob: Blob,
  maskData: { data: Uint8Array; width: number; height: number },
  mode: BackgroundMode
): Promise<Blob> {
  // Load original image at full resolution
  const img = await createImageBitmap(originalBlob);
  const { width, height } = img;

  // Create canvas at original resolution
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;

  // If white background mode, fill white first
  if (mode === "white") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }

  // Draw original image
  ctx.drawImage(img, 0, 0);

  // Get pixel data
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  // Scale mask to original dimensions if needed
  const scaledMask = scaleMask(maskData, width, height);

  // Apply mask to alpha channel
  for (let i = 0; i < scaledMask.length; i++) {
    pixels[4 * i + 3] = scaledMask[i]; // Set alpha from mask
  }

  ctx.putImageData(imageData, 0, 0);

  // Export as PNG (transparent) or JPG (white bg)
  const mimeType = mode === "transparent" ? "image/png" : "image/jpeg";
  return canvas.convertToBlob({ type: mimeType, quality: 0.95 });
}
```

## Data Flow

### Complete Processing Flow (Single Image)

```
User drops files into DropZone
    |
    v
[DropZone] validates files (type, count <= 100)
    |
    v
[Store: imageSlice] adds images with status: "pending"
    |
    v
[Queue Manager] detects new pending images, enqueues them
    |
    v
[Queue Manager] checks activeCount < maxConcurrent (2)
    |   YES                          NO
    v                                v
Dispatch to Worker              Wait in queue
    |
    v
[Main Thread] reads File as Blob/ArrayBuffer
    |
    v
[postMessage] sends { type: "process", imageData, imageId } to Worker
    |
    v
[Worker] receives message
    |
    v
[Worker: Pipeline Singleton] initializes pipeline on first call
    |   (reports model download progress via postMessage)
    v
[Worker] runs pipeline(imageData) -- ONNX inference
    |   (~1-5 seconds per image depending on resolution and device)
    v
[Worker] postMessage({ type: "inference-complete", imageId, maskData })
    |
    v
[Main Thread: useWorker hook] receives message
    |
    v
[Compositor] applies mask to original image at full resolution
    |
    v
[Store: imageSlice] updates image status: "done", stores result Blob
    |
    v
[Queue Manager] activeCount--, triggers tryProcessNext()
    |
    v
[ImageCard] re-renders with completed preview + download button
```

### Model Loading Flow (First Use)

```
[Queue Manager] dispatches first image to Worker
    |
    v
[Worker: Pipeline Singleton] getInstance() called for first time
    |
    v
[Transformers.js] begins downloading RMBG-1.4 ONNX model (~45MB)
    |   Sends progress events: { status: "progress", file, progress }
    v
[Worker] relays progress via postMessage
    |
    v
[Store: modelSlice] updates loading state + progress percentage
    |
    v
[UI] shows model download progress bar
    |
    v
[Transformers.js] model downloaded, cached in browser Cache API
    |
    v
[Pipeline] ONNX Runtime initializes, pipeline ready
    |
    v
[Worker] postMessage({ type: "model-ready" })
    |
    v
[Store: modelSlice] sets modelReady: true
    |
    v
(Subsequent visits: model loads from Cache API, near-instant)
```

### Batch ZIP Download Flow

```
User clicks "Download All as ZIP"
    |
    v
[DownloadBar] reads all completed image Blobs from store
    |
    v
[JSZip] creates new ZIP instance
    |
    v
[Loop] for each completed image:
    |   zip.file(`image-${index}.png`, blob)
    v
[JSZip] zip.generateAsync({ type: "blob" })
    |   (reports progress for large batches)
    v
[URL.createObjectURL] creates download link
    |
    v
[Programmatic <a> click] triggers browser download
    |
    v
[URL.revokeObjectURL] cleans up memory
```

### State Management Flow

```
[Zustand Store]
    |
    +-- imageSlice
    |   |-- images: ImageItem[]
    |   |     { id, file, status, progress, resultBlob, thumbnailUrl, error }
    |   |-- addImages(files: File[])
    |   |-- updateStatus(id, status)
    |   |-- updateProgress(id, progress)
    |   |-- setResult(id, blob)
    |   |-- removeImage(id)
    |   +-- clearAll()
    |
    +-- modelSlice
    |   |-- modelStatus: "idle" | "downloading" | "ready" | "error"
    |   |-- downloadProgress: number
    |   +-- setModelStatus(status)
    |
    +-- settingsSlice
        |-- backgroundMode: "transparent" | "white"
        |-- theme: "light" | "dark"
        |-- setBackgroundMode(mode)
        +-- setTheme(theme)
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-10 images | Current architecture handles fine. Single worker, sequential processing. Total time: 5-50 seconds. |
| 10-50 images | Queue keeps memory stable. Consider showing estimated time remaining. User may navigate away -- warn about losing progress. |
| 50-100 images | Memory pressure becomes real. Eagerly revoke object URLs for thumbnails of completed items. Consider processing in chunks of 10 with explicit GC pauses between chunks. |
| 100+ images | Out of scope per requirements, but if needed: explore streaming results to IndexedDB instead of holding all Blobs in memory. Use `navigator.storage.estimate()` to check available space before starting. |

### Scaling Priorities

1. **First bottleneck: Memory** -- Each original image File plus its processed PNG Blob live in memory simultaneously. A batch of 100 high-resolution images (5MB each) means 500MB input + 500MB output = 1GB. Mitigation: store results as object URLs pointing to Blobs (browser manages memory more efficiently), and revoke URLs eagerly when no longer displayed.

2. **Second bottleneck: Processing time** -- At ~3 seconds per image, 100 images takes ~5 minutes with concurrency of 2. This is acceptable for a free tool but users need clear progress indication and the ability to download completed images before the full batch finishes.

## Anti-Patterns

### Anti-Pattern 1: Running Inference on the Main Thread

**What people do:** Import `@huggingface/transformers` directly in a React component and call the pipeline there.
**Why it's wrong:** ONNX inference is CPU-intensive and will freeze the UI for 1-5 seconds per image. Users cannot interact with the page, progress bars stop animating, and the browser may show "page unresponsive" warnings.
**Do this instead:** Always run inference in a Web Worker. The singleton pipeline pattern inside the worker ensures the model loads once and the main thread stays responsive.

### Anti-Pattern 2: Spawning a New Worker Per Image

**What people do:** Create a new `Worker()` instance for each image in the batch.
**Why it's wrong:** Each worker loads its own copy of the ~45MB RMBG-1.4 model into memory. With 100 images, this would attempt to allocate ~4.5GB for model copies alone, crashing the tab instantly.
**Do this instead:** Use a single long-lived Worker with a singleton pipeline. The queue manager dispatches images one at a time to this worker. The model loads once and is reused for all images.

### Anti-Pattern 3: Loading All 100 Images Into Memory at Upload Time

**What people do:** Immediately read all files as ArrayBuffers or data URLs when the user drops them.
**Why it's wrong:** 100 images at 5MB each = 500MB allocated immediately, before any processing starts. Combined with the processing pipeline, this can easily exceed 2GB and crash.
**Do this instead:** Keep File references (which are lazy -- they do not read file content into memory). Only read a File into memory when it reaches the front of the processing queue. Create thumbnail previews using `URL.createObjectURL(file)` which is a zero-copy reference.

### Anti-Pattern 4: Using `image-segmentation` Pipeline Instead of `background-removal`

**What people do:** Use the older `image-segmentation` pipeline task, which returns a labeled mask that requires manual post-processing to isolate the foreground.
**Why it's wrong:** As of Transformers.js v3.4+, the dedicated `background-removal` pipeline handles mask generation and foreground extraction in a single call with optimized post-processing. Using `image-segmentation` means reimplementing logic that already exists.
**Do this instead:** Use `pipeline("background-removal", "briaai/RMBG-1.4")` directly. This returns a RawImage with the background already removed, though you may still want Canvas compositing for full-resolution output and background mode options (transparent vs white).

### Anti-Pattern 5: Not Handling Model Download State

**What people do:** Start processing immediately and show a blank/frozen UI while the 45MB model downloads in the background.
**Why it's wrong:** Users think the app is broken. First-time model download can take 5-30 seconds on slow connections.
**Do this instead:** Track model download progress via the `progress_callback` option on the pipeline constructor. Show a clear progress bar with "Downloading AI model (first time only)..." messaging. The model is cached by the browser's Cache API, so subsequent visits skip this step.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Hugging Face CDN | Model download via Transformers.js | ~45MB RMBG-1.4 model files auto-cached in browser Cache API. No API keys needed. Rate limits unlikely for static model downloads but could be an issue on Hugging Face Spaces with high traffic. |
| GitHub Pages | Static file hosting | Vite builds to `dist/`. Set `base` in `vite.config.ts` to repo name (e.g., `/BatchClear.io/`). All assets served as static files -- no SSR, no API routes. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| UI <-> Store | Zustand hooks (`useStore`) | Components subscribe to store slices. Re-renders scoped to used selectors. |
| Store <-> Queue Manager | Direct function calls | Queue Manager imports store actions. Not a React component itself -- initialized in a `useEffect` or at app startup. |
| Main Thread <-> Worker | `postMessage` / `onmessage` | Structured clone for small data. Use Transferable objects (ArrayBuffer) for image data to avoid copying large buffers. |
| Worker <-> Transformers.js | Pipeline API | The Worker is the only consumer of `@huggingface/transformers`. This boundary is important -- if Transformers.js API changes, only `inference.worker.ts` needs updating. |
| Compositor <-> Canvas API | Direct API calls | `OffscreenCanvas` preferred (works in modern browsers, usable from workers). Fallback to regular `<canvas>` if needed. |
| ZIP Builder <-> JSZip | Library API | Pass collected Blobs to JSZip. Consider `client-zip` as a lighter alternative if JSZip performance is inadequate for large batches. |

## Build Order Implications

The architecture has clear dependency layers that inform phase ordering:

1. **Foundation (must come first):** Vite + React + Tailwind scaffold, Zustand store skeleton, basic routing/layout. Everything else depends on this.

2. **Worker + Pipeline (core engine):** The Web Worker with Pipeline Singleton is the heart of the app. Build and test this with a single hardcoded image before any UI complexity. This validates that `@huggingface/transformers` works correctly with Vite bundling and that the Worker communication pattern is solid.

3. **Compositor (depends on Worker):** Canvas compositing logic consumes Worker output. Must be built after Worker produces mask data. Test with a single image end-to-end.

4. **DropZone + Image State (depends on Store):** File upload and image list management. This connects user input to the processing pipeline.

5. **Queue Manager (depends on Worker + Store):** Concurrency control wires together the store (image list) with the worker (processing). Cannot be built until both exist.

6. **Full UI (depends on all above):** ImageGrid, progress bars, controls, theming. These are rendering concerns that consume state -- build them last when the data flow is proven.

7. **ZIP Download (depends on results):** Needs completed Blobs to exist. Build after end-to-end processing works.

8. **Polish + Deploy:** GitHub Pages deployment config, performance optimization, error handling edge cases, mobile responsiveness.

## Key Architectural Decision: Single Worker vs Worker Pool

**Recommendation: Start with a single Web Worker.**

Rationale:
- RMBG-1.4 at q8 quantization uses ~45MB of model memory per worker instance. Two workers = ~90MB just for model weights.
- ONNX Runtime within a single worker can utilize multiple CPU cores via WebAssembly threads (SharedArrayBuffer). Adding more workers does not necessarily increase parallelism -- it may even slow things down due to contention.
- The concurrency queue with max 2 refers to having 2 images "in flight" (one being processed, one being composited), not 2 simultaneous ONNX inferences.
- If benchmarking shows that a second worker provides meaningful speedup (2x throughput without stability issues), it can be added later without architectural changes -- the queue manager already supports dispatching to multiple workers.

## Key Architectural Decision: `background-removal` vs `image-segmentation` Pipeline

**Recommendation: Use the `background-removal` pipeline task (available in @huggingface/transformers v3.4+).**

Rationale:
- The `background-removal` pipeline was specifically added for this use case. It handles model-specific preprocessing and returns a RawImage with the background already transparent.
- However, for **full-resolution output**, you still need the Canvas compositing step. The pipeline may process images at the model's internal resolution (typically 1024x1024 for RMBG-1.4). To preserve original resolution, extract the mask from the pipeline output and apply it to the original image via Canvas API.
- Verify during implementation whether the pipeline handles upscaling automatically or if manual mask resizing is needed. This is a key validation point for the first implementation phase.

## Sources

- [Transformers.js Official Documentation](https://huggingface.co/docs/transformers.js/en/index) -- HIGH confidence
- [Transformers.js React Tutorial (Hugging Face)](https://huggingface.co/docs/transformers.js/tutorials/react) -- HIGH confidence, official tutorial showing Worker + Singleton pattern
- [Transformers.js v3 Announcement](https://huggingface.co/blog/transformersjs-v3) -- HIGH confidence, confirms `@huggingface/transformers` package name
- [Background-Removal Pipeline PR #1216](https://github.com/huggingface/transformers.js/pull/1216) -- HIGH confidence, confirms `background-removal` task type and supported models
- [Transformers.js v3.4.0 Release](https://github.com/huggingface/transformers.js/releases/tag/3.4.0) -- HIGH confidence, confirms `background-removal` pipeline release
- [bg-remove by Addy Osmani](https://github.com/addyosmani/bg-remove) -- MEDIUM confidence, reference implementation for React + Transformers.js + RMBG-1.4
- [MDN: Transferable Objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) -- HIGH confidence, official Web API docs
- [MDN: OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) -- HIGH confidence, official Web API docs
- [Canvas Compositing (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Compositing) -- HIGH confidence
- [Chrome Developers: Transferable Objects](https://developer.chrome.com/blog/transferable-objects-lightning-fast) -- HIGH confidence, zero-copy transfer explanation
- [JSZip Official Documentation](https://stuk.github.io/jszip/) -- HIGH confidence
- [client-zip (alternative to JSZip)](https://github.com/Touffy/client-zip) -- MEDIUM confidence, noted as 40x faster alternative
- [Zustand GitHub](https://github.com/pmndrs/zustand) -- HIGH confidence
- [LogRocket: Background Remover with Vue + Transformers.js](https://blog.logrocket.com/building-background-remover-vue-transformers-js/) -- MEDIUM confidence, confirms Canvas compositing data flow
- [Web Workers Image Processing (SitePoint)](https://www.sitepoint.com/using-web-workers-to-improve-image-manipulation-performance/) -- MEDIUM confidence

---
*Architecture research for: BatchClear.io -- client-side batch image background removal*
*Researched: 2026-02-19*
