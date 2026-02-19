# Phase 2: Batch Upload + Full UI - Research

**Researched:** 2026-02-19
**Domain:** Batch file processing queue, drag-and-drop upload, dark/light theming, before/after comparison UI
**Confidence:** HIGH

## Summary

Phase 2 transforms BatchClear.io from a single-image proof-of-concept into a full batch processing application. The core technical challenges are: (1) a concurrency-limited processing queue that sends images to the existing Web Worker singleton two at a time, with per-image state tracking and retry capability; (2) a complete UI rebuild with responsive image grid, before/after comparison, background mode toggle (transparent PNG vs white JPG), and dark/light theme; (3) careful memory management for up to 100 Blob URLs and canvas operations on iOS Safari.

The Phase 1 architecture is solid -- the Worker singleton, typed message protocol, and compositor are all reusable. The main refactoring needed is replacing the single-image state in `App.tsx` with a multi-image state machine (using `useReducer`), and extending the compositor to support white-background JPG output alongside transparent PNG. The DropZone component needs to accept multiple files (react-dropzone replaces the current hand-rolled implementation), and a new concurrency queue (`p-limit`) gates processing to max 2 simultaneous images.

**Primary recommendation:** Use react-dropzone for multi-file upload with validation, p-limit for concurrency control, useReducer for batch state management, Tailwind v4 `@custom-variant` for class-based dark mode, and hand-roll the before/after comparison (too simple to justify a dependency). Process at most 2 images concurrently through the existing single Worker to avoid doubling model memory.

## Standard Stack

### Core (new for Phase 2)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-dropzone | ^14.4.x | Multi-file drag-and-drop + click-to-browse | De facto standard. 10M+ weekly downloads. React 19 compatible (v14.3.6+). Typed. Handles file validation, MIME checking, maxFiles. |
| p-limit | ^7.3.0 | Concurrency limiter (max 2 concurrent) | 130M+ weekly downloads. Pure ESM. Works in browsers. ~1kB. Simpler than p-queue for our needs. |

### Existing (from Phase 1, unchanged)

| Library | Version | Purpose |
|---------|---------|---------|
| React | ^19.0.0 | UI framework |
| @huggingface/transformers | ^3.8.0 | ML inference (Web Worker) |
| Tailwind CSS | ^4.0.0 | Styling + dark mode via @custom-variant |
| Vite | ^6.1.0 | Build tool |
| heic-to | ^1.4.2 | HEIC conversion |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-dropzone | Hand-rolled (current Phase 1 DropZone) | Current DropZone handles single file only. react-dropzone adds maxFiles, file validation, fileRejections, MIME detection -- rewriting all this is error-prone. |
| p-limit | p-queue | p-queue is a full queue with priority, timeout, events. We only need concurrency limiting. p-limit is ~1kB vs ~5kB and sufficient. |
| p-limit | Custom async queue | Deceptively complex to get right (error handling, retry, cancellation). p-limit is battle-tested. |
| react-dropzone v15 | react-dropzone v14.4.x | v15 has a breaking change to isDragReject behavior (clears after drop). v14.4.x is stable and React 19 compatible. Use v14.4.x. |
| img-comparison-slider | Hand-rolled CSS clip-path | Before/after comparison is ~60 lines of CSS + ~80 lines of React. No library needed. CSS clip-path + range input is the standard pattern. |

**Installation:**
```bash
npm install react-dropzone p-limit
```

## Architecture Patterns

### Recommended Project Structure (Phase 2 additions)

```
src/
  components/
    App.tsx                    # Refactored: useReducer for batch state
    DropZone.tsx               # REPLACED: react-dropzone based, multi-file
    ImageGrid.tsx              # NEW: responsive grid of ImageCards
    ImageCard.tsx              # NEW: single image with before/after, status
    BeforeAfter.tsx            # NEW: clip-path comparison component
    BatchProgress.tsx          # NEW: "23 of 100 processed" indicator
    BackgroundToggle.tsx       # NEW: transparent/white toggle
    ThemeToggle.tsx            # NEW: dark/light toggle
    ModelProgress.tsx          # UNCHANGED
  lib/
    types.ts                   # EXTENDED: ImageItem, BatchState, Actions
    compositor.ts              # EXTENDED: support white background output
    queue.ts                   # NEW: p-limit based processing queue
    theme.ts                   # NEW: theme persistence (localStorage)
  workers/
    inference.worker.ts        # UNCHANGED
  main.tsx                     # MINOR: add theme init script
  index.css                    # EXTENDED: @custom-variant dark, checkerboard
```

### Pattern 1: Batch State with useReducer

**What:** A discriminated-union action type with useReducer to manage the lifecycle of up to 100 images. Each image has an independent status: `idle` | `queued` | `processing` | `done` | `error`.

**When to use:** Always when managing a collection of items with independent lifecycles. useState becomes unmaintainable beyond ~3 state variables.

**Example:**
```typescript
// src/lib/types.ts
export type ImageStatus = "idle" | "queued" | "processing" | "done" | "error";

export type BackgroundMode = "transparent" | "white";

export interface ImageItem {
  id: string;
  file: File;
  status: ImageStatus;
  error?: string;
  originalUrl: string;       // Blob URL for preview
  resultUrl?: string;        // Blob URL for processed result (transparent)
  resultWhiteUrl?: string;   // Blob URL for white-background result
}

export interface BatchState {
  images: ImageItem[];
  backgroundMode: BackgroundMode;
}

export type BatchAction =
  | { type: "ADD_IMAGES"; files: File[] }
  | { type: "SET_QUEUED"; id: string }
  | { type: "SET_PROCESSING"; id: string }
  | { type: "SET_DONE"; id: string; resultUrl: string; resultWhiteUrl: string }
  | { type: "SET_ERROR"; id: string; error: string }
  | { type: "RETRY"; id: string }
  | { type: "REMOVE"; id: string }
  | { type: "SET_BACKGROUND_MODE"; mode: BackgroundMode }
  | { type: "CLEAR_ALL" };
```

### Pattern 2: Concurrency Queue with p-limit

**What:** Use `p-limit(2)` to ensure at most 2 images process concurrently through the single Worker. The Worker already supports concurrent requests via imageId tagging.

**When to use:** Always for batch processing. Without concurrency limits, 100 simultaneous inference calls would exhaust GPU/WASM memory.

**Example:**
```typescript
// src/lib/queue.ts
import pLimit from "p-limit";

const limit = pLimit(2);

export function enqueueProcessing(
  images: ImageItem[],
  processOne: (image: ImageItem) => Promise<void>,
): void {
  for (const image of images) {
    limit(() => processOne(image));
  }
}
```

**Why max 2 concurrent:** The Worker singleton has one model instance. ONNX Runtime can overlap preprocessing of image N+1 while running inference on image N, so concurrency=2 gives a mild throughput benefit (~10-15%) without doubling memory. Concurrency=3+ provides no further benefit and risks OOM on mobile.

### Pattern 3: react-dropzone Multi-File Upload

**What:** Replace the hand-rolled DropZone with react-dropzone's `useDropzone` hook for multi-file support with built-in validation.

**When to use:** Always when accepting multiple files with validation rules.

**Example:**
```typescript
// src/components/DropZone.tsx
import { useDropzone, type FileRejection } from "react-dropzone";

const ACCEPT = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
};

interface DropZoneProps {
  onFilesAccepted: (files: File[]) => void;
  onFilesRejected: (rejections: FileRejection[]) => void;
  disabled: boolean;
}

export function DropZone({ onFilesAccepted, onFilesRejected, disabled }: DropZoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT,
    maxFiles: 100,
    multiple: true,
    disabled,
    onDropAccepted: onFilesAccepted,
    onDropRejected: onFilesRejected,
  });

  return (
    <div {...getRootProps()}>
      <input {...getInputProps()} />
      {isDragActive ? "Drop images here..." : "Drag & drop up to 100 images"}
    </div>
  );
}
```

### Pattern 4: Tailwind v4 Dark Mode with @custom-variant

**What:** Tailwind v4 uses `@custom-variant` in CSS to enable class-based dark mode toggling. The `.dark` class on `<html>` activates all `dark:` utilities.

**When to use:** For manual dark/light toggle that persists in localStorage.

**Setup:**
```css
/* src/index.css */
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

/* Theme-aware CSS variables for components that need them */
:root {
  --checkerboard-light: #e5e7eb;
  --checkerboard-dark: #374151;
}
.dark {
  --checkerboard-light: #374151;
  --checkerboard-dark: #1f2937;
}
```

**Theme init (no-FOUC):**
```html
<!-- index.html, in <head> BEFORE other scripts -->
<script>
  document.documentElement.classList.toggle(
    "dark",
    localStorage.theme === "dark" ||
      (!("theme" in localStorage) &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
  );
</script>
```

### Pattern 5: Before/After Comparison with CSS clip-path

**What:** A zero-dependency before/after image comparison using CSS `clip-path: inset()` controlled by a range input. The "before" image is shown at full width; the "after" image is clipped from the left based on slider position.

**When to use:** For each processed image card.

**Example:**
```typescript
// src/components/BeforeAfter.tsx
import { useState } from "react";

interface BeforeAfterProps {
  beforeUrl: string;
  afterUrl: string;
  alt: string;
}

export function BeforeAfter({ beforeUrl, afterUrl, alt }: BeforeAfterProps) {
  const [position, setPosition] = useState(50);

  return (
    <div className="relative overflow-hidden select-none">
      {/* After (result) - full image */}
      <img src={afterUrl} alt={`${alt} - after`} className="block w-full" />
      {/* Before (original) - clipped */}
      <img
        src={beforeUrl}
        alt={`${alt} - before`}
        className="absolute inset-0 w-full"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      />
      {/* Slider */}
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        className="absolute inset-0 z-10 h-full w-full cursor-col-resize opacity-0"
      />
      {/* Divider line */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 bg-white shadow-lg"
        style={{ left: `${position}%` }}
      />
    </div>
  );
}
```

### Pattern 6: Compositor Extension for White Background

**What:** Extend `compositeFullResolution` to accept a `backgroundMode` parameter. For white background, fill canvas with white before drawing the masked image, then export as JPEG.

**Example:**
```typescript
// Extension to src/lib/compositor.ts
export async function compositeFullResolution(
  originalBlob: Blob,
  maskData: MaskData,
  background: "transparent" | "white" = "transparent",
): Promise<Blob> {
  // ... existing mask compositing logic ...

  if (background === "white") {
    // Create a new canvas, fill white, draw masked image on top
    const whiteCanvas = new OffscreenCanvas(origW, origH);
    const whiteCtx = whiteCanvas.getContext("2d")!;
    whiteCtx.fillStyle = "#ffffff";
    whiteCtx.fillRect(0, 0, origW, origH);
    whiteCtx.drawImage(outputCanvas, 0, 0);
    const result = await whiteCanvas.convertToBlob({
      type: "image/jpeg",
      quality: 0.95,
    });
    whiteCanvas.width = 1;
    whiteCanvas.height = 1;
    return result;
  }

  return outputCanvas.convertToBlob({ type: "image/png" });
}
```

### Pattern 7: Responsive Image Grid

**What:** CSS Grid with `auto-fill` and `minmax()` for a responsive grid that adapts from 1 column on mobile to 4+ on desktop.

**Example:**
```html
<div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
  <!-- ImageCard components -->
</div>
```

### Anti-Patterns to Avoid

- **Creating multiple Workers for concurrency:** Each Worker loads its own copy of the ~45MB model. Use a single Worker with p-limit on the main thread to gate requests.
- **Storing processed images in React state as base64:** Always use Blob URLs. Base64 is ~33% larger and creates GC pressure. Store URLs in state, Blobs in memory.
- **Not revoking Blob URLs:** With 100 images x 2 URLs each (original + result), failing to revoke creates 200+ dangling references. Revoke on image removal and on batch clear.
- **Processing HEIC conversion inside the queue:** HEIC conversion is CPU-intensive. Convert HEIC to JPEG at drop time (before queuing) so the queue only handles inference.
- **Using prefers-color-scheme without class override:** System-only dark mode prevents manual toggling. Use `@custom-variant dark (&:where(.dark, .dark *))` for class-based control.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-file drag-and-drop | Custom drag event handling with file validation | react-dropzone `useDropzone` hook | Handles accept filtering, maxFiles, fileRejections, browser quirks (MIME type detection varies by OS), accessibility. |
| Concurrency limiting | Custom Promise queue with semaphore | p-limit | Edge cases: error propagation, concurrent limit changes, memory leaks from uncleaned promises. 1kB, battle-tested. |
| File type validation | Manual MIME checking + extension parsing | react-dropzone `accept` prop | Cross-browser MIME detection is inconsistent (CSV reports differently on macOS vs Windows). react-dropzone handles platform-specific quirks. |

**Key insight:** The processing queue and the upload handling are the two areas where custom code is most tempting but most dangerous. p-limit for concurrency and react-dropzone for upload validation eliminate entire classes of bugs.

## Common Pitfalls

### Pitfall 1: Blob URL Memory Leak with Batch Processing

**What goes wrong:** Each `URL.createObjectURL()` creates a reference that persists until explicitly revoked. With 100 images, each having an original preview URL and a result URL, memory can exceed 1GB if URLs are not revoked.

**Why it happens:** Unlike regular JS objects, Blob URLs are not garbage-collected when unreferenced. The browser holds the underlying Blob in memory.

**How to avoid:** Revoke URLs in the reducer's `REMOVE` and `CLEAR_ALL` actions. Revoke old result URLs when retrying an image. Track all created URLs and revoke on component unmount.

**Warning signs:** Browser memory growing linearly with processed images in Task Manager. Tab crash after processing 50+ images.

### Pitfall 2: iOS Safari Canvas Memory with 100 Images

**What goes wrong:** Processing 100 images sequentially creates and destroys canvases. iOS Safari's canvas memory ceiling (~384MB) is cumulative and GC is lazy. Even with cleanup, rapid sequential processing can hit the limit.

**Why it happens:** The compositor creates 3 OffscreenCanvases per image. Even with shrink-to-1x1 cleanup, Safari may not release memory fast enough for the next image.

**How to avoid:** (1) The concurrency limit of 2 naturally gates canvas creation. (2) The compositor already implements shrink-to-1x1 cleanup. (3) Do NOT create preview thumbnails via canvas -- use `<img src={blobUrl}>` which the browser optimizes internally. (4) If issues arise, add a small delay (`await new Promise(r => setTimeout(r, 50))`) between compositor calls to let GC run.

**Warning signs:** White/blank images appearing after processing 30-40 images on iPhone.

### Pitfall 3: HEIC Conversion Blocking the Queue

**What goes wrong:** If HEIC conversion happens inside the processing queue, it counts against the concurrency limit. A batch of 50 HEIC files from an iPhone would serialize: convert -> infer -> convert -> infer, halving throughput.

**Why it happens:** Natural instinct is to put all per-image processing in one function.

**How to avoid:** Convert HEIC to JPEG at drop time (in the `ADD_IMAGES` handler), before enqueueing. The converted File object replaces the original in state. This way the queue only handles inference + compositing.

**Warning signs:** Processing speed drops 50% when using iPhone photos vs. JPGs.

### Pitfall 4: Flash of Unstyled Content (FOUC) with Dark Mode

**What goes wrong:** Page loads in light mode, then JavaScript detects dark mode preference and toggles the class, causing a visible flash.

**Why it happens:** React hydration happens after the initial paint. If theme detection is inside a useEffect, it runs after the first render.

**How to avoid:** Place a synchronous `<script>` tag in `<head>` (before the body) that reads localStorage and sets the `.dark` class on `<html>`. This runs before any rendering.

**Warning signs:** Brief white flash when loading in dark mode.

### Pitfall 5: react-dropzone accept Prop Format

**What goes wrong:** Passing accept as a string array (`["image/png", "image/jpeg"]`) or comma-separated string causes silent failure -- all files get accepted without filtering.

**Why it happens:** react-dropzone's accept format changed from v12 to v13+. It now requires an object with MIME types as keys and extension arrays as values.

**How to avoid:** Always use the object format: `{ "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"] }`. Include file extensions for better cross-browser compatibility.

**Warning signs:** Unsupported file types being accepted without any rejection error.

### Pitfall 6: Worker Message Ordering with Concurrent Requests

**What goes wrong:** With concurrency=2, the Worker may complete image B before image A. If the UI assumes sequential completion, results get assigned to wrong images.

**Why it happens:** Inference time varies by image complexity and resolution. Smaller/simpler images process faster.

**How to avoid:** The existing Worker protocol already includes `imageId` in every message. Match responses to images by ID, never by order. The `useReducer` pattern naturally handles this -- each `SET_DONE` action carries the image ID.

**Warning signs:** Processed results appearing on wrong image cards.

## Code Examples

### Checkerboard Pattern CSS (for transparent area preview)

```css
/* Tailwind v4 with @theme for checkerboard that respects dark mode */
.checkerboard {
  background-image:
    linear-gradient(45deg, var(--checkerboard-light) 25%, transparent 25%),
    linear-gradient(-45deg, var(--checkerboard-light) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--checkerboard-light) 75%),
    linear-gradient(-45deg, transparent 75%, var(--checkerboard-light) 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0;
}
```

### Theme Toggle Component

```typescript
// src/components/ThemeToggle.tsx
import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem("theme") as Theme) ?? "system";
  });

  const applyTheme = useCallback((t: Theme) => {
    const isDark =
      t === "dark" ||
      (t === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  useEffect(() => {
    applyTheme(theme);
    if (theme === "system") {
      localStorage.removeItem("theme");
    } else {
      localStorage.setItem("theme", theme);
    }
  }, [theme, applyTheme]);

  return (
    <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}>
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
```

### Batch Progress Indicator

```typescript
// src/components/BatchProgress.tsx
interface BatchProgressProps {
  total: number;
  done: number;
  processing: number;
  errors: number;
}

export function BatchProgress({ total, done, processing, errors }: BatchProgressProps) {
  const percent = total > 0 ? (done / total) * 100 : 0;

  return (
    <div className="w-full">
      <div className="flex justify-between text-sm">
        <span>{done} of {total} processed</span>
        {errors > 0 && <span className="text-red-500">{errors} failed</span>}
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
```

### Generating Both Output Formats at Once

```typescript
// Process each image and generate both transparent and white-background versions
async function processImage(image: ImageItem, worker: Worker): Promise<{
  transparentUrl: string;
  whiteUrl: string;
}> {
  // 1. Send to worker for inference
  const maskData = await runInference(worker, image.file);

  // 2. Generate transparent PNG
  const transparentBlob = await compositeFullResolution(
    image.file, maskData, "transparent"
  );
  const transparentUrl = URL.createObjectURL(transparentBlob);

  // 3. Generate white-background JPG
  const whiteBlob = await compositeFullResolution(
    image.file, maskData, "white"
  );
  const whiteUrl = URL.createObjectURL(whiteBlob);

  return { transparentUrl, whiteUrl };
}
```

### Image Card Status Indicators

```typescript
// Visual status indicators per image
function StatusBadge({ status }: { status: ImageStatus }) {
  const styles: Record<ImageStatus, string> = {
    idle: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    queued: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    processing: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    done: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    error: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  };

  const labels: Record<ImageStatus, string> = {
    idle: "Waiting",
    queued: "Queued",
    processing: "Processing...",
    done: "Done",
    error: "Error",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tailwind v3 `darkMode: "class"` in config | Tailwind v4 `@custom-variant dark` in CSS | Jan 2025 | No config file. Dark mode defined directly in CSS. |
| react-dropzone v12 `accept` as string | react-dropzone v13+ `accept` as object | v13.0.0 | Format: `{ "image/png": [".png"] }` not `"image/png"` |
| Custom before/after slider libraries | CSS `clip-path: inset()` + range input | Ongoing | Zero dependencies. ~80 lines of code. |
| JSZip for batch output | fflate (Phase 3) | Ongoing | Not needed yet -- Phase 3 concern. |
| p-limit CJS | p-limit v7+ ESM | v6.0.0 | Pure ESM. Works in browsers natively. |

**Deprecated/outdated:**
- react-dropzone `accept` as string or array: Will silently fail to filter. Use object format only.
- `darkMode: "class"` in `tailwind.config.js`: Tailwind v4 has no config file. Use `@custom-variant` in CSS.

## Open Questions

1. **Generating both output formats at processing time vs. on toggle**
   - What we know: The compositor can produce either PNG (transparent) or JPG (white). Generating both at processing time costs ~2x canvas operations per image but means instant preview switching.
   - What's unclear: Whether generating both upfront causes memory issues with 100 images (200 Blob URLs + underlying Blobs).
   - Recommendation: Generate both at processing time. The additional Blob is ~500KB-2MB per image (JPG is smaller than PNG). 100 images x 2MB = ~200MB of Blobs, which is within browser limits. The UX benefit of instant toggle is significant. If memory becomes an issue, fall back to generating on-demand with a loading state.

2. **Safari EXIF orientation in batch mode**
   - What we know: Phase 1 flagged this as a concern. Modern browsers auto-apply EXIF in `createImageBitmap()` (the default `imageOrientation` is "from-image" which respects EXIF). WebKit committed EXIF support for createImageBitmap from Blob.
   - What's unclear: Whether all target Safari versions handle this correctly.
   - Recommendation: Proceed with current compositor (uses `createImageBitmap`). Add a manual test with an iPhone portrait photo during Phase 2 verification. If orientation is wrong, use the `imageOrientation` option on `createImageBitmap`.

3. **Retry semantics for failed images**
   - What we know: UPLD-06 requires individual retry. The Worker already supports concurrent requests via imageId.
   - Recommendation: On retry, set status back to "queued" and re-enqueue through p-limit. The queue handles concurrency automatically.

## Sources

### Primary (HIGH confidence)
- [Tailwind CSS v4 Dark Mode docs](https://tailwindcss.com/docs/dark-mode) -- `@custom-variant dark (&:where(.dark, .dark *))` for class-based toggle
- [Tailwind CSS v4 Theme docs](https://tailwindcss.com/docs/theme) -- `@theme` directive for design tokens
- [react-dropzone GitHub repo](https://github.com/react-dropzone/react-dropzone) -- v14.4.x, React 19 compatible, useDropzone hook
- [react-dropzone TypeScript definitions](https://github.com/react-dropzone/react-dropzone/blob/master/typings/react-dropzone.d.ts) -- DropzoneOptions, FileRejection, ErrorCode types
- [react-dropzone accept example](https://github.com/react-dropzone/react-dropzone/tree/master/examples/accept) -- Object format: `{ "image/png": [".png"] }`
- [p-limit GitHub](https://github.com/sindresorhus/p-limit) -- v7.3.0, ESM, browser-compatible, concurrency control
- [MDN: OffscreenCanvas.convertToBlob()](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/convertToBlob) -- type: "image/jpeg" + quality option
- [MDN: URL.createObjectURL()](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static) -- Memory management, revokeObjectURL requirement
- [WebKit createImageBitmap EXIF commit](https://github.com/WebKit/WebKit/commit/8758b1b9f85526f462e6edb74d5c85228e15d90d) -- Safari EXIF orientation support

### Secondary (MEDIUM confidence)
- [PQINA: iOS Safari canvas memory ceiling](https://pqina.nl/blog/total-canvas-memory-use-exceeds-the-maximum-limit) -- 384MB limit on iOS 15+
- [react-dropzone v14.3.6 React 19 fix](https://github.com/react-dropzone/react-dropzone/issues/1400) -- Confirmed React 19 compatibility
- [react-dropzone v15.0.0 release](https://github.com/react-dropzone/react-dropzone/releases/tag/v15.0.0) -- Breaking change: isDragReject clears after drop
- [CSS clip-path for image comparison](https://www.letsbuildui.dev/articles/how-to-build-an-image-comparison-slider/) -- Build from scratch pattern, ~100 lines

### Tertiary (LOW confidence)
- Concurrency=2 throughput benefit (~10-15%): Based on general ONNX Runtime pipelining behavior. Exact benefit depends on image sizes and device. Needs empirical measurement.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- react-dropzone v14.4.x + p-limit v7.3.0 verified against npm, GitHub releases. Both confirmed browser-compatible.
- Architecture: HIGH -- useReducer for batch state, p-limit for concurrency, compositor extension for white background all follow established patterns with clear implementations.
- Dark mode: HIGH -- Tailwind v4 `@custom-variant` verified against official docs. localStorage + class toggle is the standard pattern.
- Pitfalls: HIGH -- Blob URL leaks, iOS canvas memory, FOUC all documented with multiple sources.
- Before/after UI: HIGH -- CSS clip-path approach verified against MDN. Simple enough to hand-roll confidently.

**Research date:** 2026-02-19
**Valid until:** ~2026-03-19 (30 days -- stack is stable)
