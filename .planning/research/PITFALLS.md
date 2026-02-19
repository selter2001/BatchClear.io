# Pitfalls Research

**Domain:** Client-side batch AI image background removal (browser-only)
**Researched:** 2026-02-19
**Confidence:** HIGH (verified across official docs, browser bug trackers, and multiple GitHub issues)

## Critical Pitfalls

### Pitfall 1: iOS Safari Canvas Memory Ceiling Kills Batch Processing

**What goes wrong:**
iOS Safari enforces a hard cap of ~224-384 MB total canvas memory across all canvases on the page. Each full-resolution canvas consumes `width * height * 4` bytes (RGBA). A single 4000x3000 photo uses ~48 MB of canvas memory. Processing even 5-8 such images simultaneously -- or leaving their canvases alive after processing -- hits the ceiling and triggers "Total canvas memory use exceeds the maximum limit", silently destroying canvas contents or crashing the tab entirely. Desktop Safari caps at ~2 GB, which is more forgiving but still finite.

**Why it happens:**
Developers test on desktop Chrome (which has no practical canvas memory limit) and never encounter this. The natural approach of creating one canvas per image and keeping results in-DOM until the user downloads them is a memory bomb on mobile Safari.

**How to avoid:**
- Reuse a single OffscreenCanvas (or a small pool of 2) for compositing. Never keep one canvas per image alive.
- After compositing each image, immediately extract the result as a Blob (via `canvas.toBlob()`), store the Blob, and release the canvas by setting `canvas.width = 1; canvas.height = 1; ctx.clearRect(0, 0, 1, 1)`.
- Display results using `<img>` tags pointing to Blob URLs, not live canvases.
- For thumbnails/previews, draw to a small canvas (e.g., 256px wide) rather than full resolution.

**Warning signs:**
- White/blank canvases appearing after several images processed
- Safari console showing "Total canvas memory use exceeds the maximum limit"
- Tab crashing on mobile devices after processing 3-5 high-resolution images

**Phase to address:**
Phase 1 (Core Architecture). Canvas pooling and Blob extraction must be designed in from the start. Retrofitting is a rewrite.

**Sources:**
- [PQINA: Total Canvas Memory Use Exceeds The Maximum Limit](https://pqina.nl/blog/total-canvas-memory-use-exceeds-the-maximum-limit)
- [Apple Developer Forums: Canvas memory limits](https://developer.apple.com/forums/thread/687866)
- [WebKit Bug 195325](https://bugs.webkit.org/show_bug.cgi?id=195325)

---

### Pitfall 2: GitHub Pages Cannot Set COOP/COEP Headers -- Multithreading Silently Disabled

**What goes wrong:**
ONNX Runtime Web's WASM backend requires `SharedArrayBuffer` for multithreading, which requires cross-origin isolation (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`). GitHub Pages does not allow custom HTTP headers. Without these headers, ONNX falls back to single-threaded WASM, which is approximately 3.4x slower per the ONNX Runtime docs. For a batch tool processing 100 images, this means the difference between "tolerable" and "unusable."

**Why it happens:**
Developers set up local dev servers (Vite's dev server can set headers) where everything works with multithreading. Deploying to GitHub Pages silently degrades to single-thread without any error -- inference still works, just much slower. Nobody notices until users complain about speed.

**How to avoid:**
- Use `coi-serviceworker` to inject COOP/COEP headers via a service worker. This is the standard workaround for static hosting. It requires the SW file to be served from the same origin (not bundled, not from CDN).
- Accept the caveat: the first page load triggers a reload (SW must install before it can intercept). This is a one-time cost.
- For Safari: even WITH coi-serviceworker, Safari's WASM multithreading via SharedArrayBuffer has a known DataCloneError bug (onnxruntime issue #11567). Force `ort.env.wasm.numThreads = 1` on Safari/WebKit browsers as a fallback.
- Test production builds on actual GitHub Pages, not just `vite preview`.

**Warning signs:**
- `crossOriginIsolated` returns `false` in browser console on deployed site
- Inference is 3-4x slower on deployed site than local dev
- Safari throwing "DataCloneError: The object can not be cloned" in production

**Phase to address:**
Phase 1 (Infrastructure/Deployment). The coi-serviceworker must be in place before any performance benchmarking makes sense.

**Sources:**
- [GitHub Community: COOP/COEP headers on Pages](https://github.com/orgs/community/discussions/13309)
- [Thomas Steiner: Setting COOP/COEP on static hosting](https://blog.tomayac.com/2025/03/08/setting-coop-coep-headers-on-static-hosting-like-github-pages/)
- [coi-serviceworker repo](https://github.com/gzuidhof/coi-serviceworker)
- [ONNX Runtime: Safari inference broken with cross-origin isolation](https://github.com/microsoft/onnxruntime/issues/11567)
- [ONNX Runtime: Performance Diagnosis](https://onnxruntime.ai/docs/tutorials/web/performance-diagnosis.html)

---

### Pitfall 3: Web Worker WASM Memory Not Freed on Termination

**What goes wrong:**
When a Web Worker running ONNX/WASM inference is terminated (via `worker.terminate()`), the WASM linear memory heap is not reliably garbage-collected. Each ONNX session allocates ~50-100 MB for the RMBG-1.4 model weights plus working memory. If workers are created and terminated per batch (or per concurrency slot), memory accumulates across the process lifetime. After processing 20-30 images, the tab can consume 1-2 GB and get killed by the OS.

**Why it happens:**
Browser garbage collectors treat WASM memory as opaque ArrayBuffers. When a worker is terminated, the GC should collect the worker's memory, but browser implementations have known bugs where WASM memory is retained. This is documented in Chromium bug 356205, Firefox bug 987799, and Electron issue 24965.

**How to avoid:**
- Create workers once at app initialization and reuse them for the entire session. Never create/terminate workers per image.
- Within the long-lived worker, reuse the ONNX InferenceSession across all images. Load the model once, run inference many times.
- If you must reset a worker (e.g., after an error), explicitly call `session.release()` inside the worker before termination, then wait briefly before terminating.
- Monitor `performance.memory` (Chrome) or equivalent to detect leaks during development.

**Warning signs:**
- Browser memory (Task Manager) growing steadily with each processed image
- Tab crash after processing ~20-30 images
- "Aw, Snap!" or equivalent out-of-memory error

**Phase to address:**
Phase 1 (Worker Architecture). Worker lifecycle is foundational. The "create once, reuse forever" pattern must be the design from day one.

**Sources:**
- [Chromium Bug: Huge memory leak after terminating worker](https://bugs.chromium.org/p/chromium/issues/detail?id=356205)
- [Firefox Bug: Memory leak after worker termination](https://bugzilla.mozilla.org/show_bug.cgi?id=987799)
- [StackBlitz: Debugging V8 WebAssembly memory](https://blog.stackblitz.com/posts/debugging-v8-webassembly/)
- [Emscripten: wasmMemory cleanup issue](https://github.com/emscripten-core/emscripten/issues/15813)

---

### Pitfall 4: Model Download UX -- 45 MB First-Load With No Feedback

**What goes wrong:**
The RMBG-1.4 quantized model is approximately 45 MB. On first visit, this must download before any processing can begin. On a 10 Mbps mobile connection, that is ~36 seconds. Without explicit progress indication, users assume the app is broken and leave. After download, Transformers.js caches in browser Cache Storage/IndexedDB, but cache can be evicted by the browser under storage pressure (especially iOS Safari, which aggressively evicts on app close).

**Why it happens:**
Developers test on fast connections with warm caches. The first-time user experience on mobile is completely different. Transformers.js handles caching internally, but provides no built-in progress UI.

**How to avoid:**
- Hook into Transformers.js download progress callbacks to show a real progress bar with MB downloaded / total MB and estimated time.
- Show an explicit "Downloading AI model (45 MB, one-time)" message so users understand this is a one-time cost.
- Consider lazy-loading the model: let users select images first, then start model download while showing the queue. This perceived performance trick makes the wait feel shorter.
- Add a "Model ready" indicator in the UI so returning users can confirm the cache is warm.
- Pre-warm the model in a Web Worker on page load (before user selects images) so it is ready when needed.

**Warning signs:**
- High bounce rate on first visit (analytics)
- Users selecting images but nothing happening for 30+ seconds
- Support complaints about "broken" or "stuck" app

**Phase to address:**
Phase 1 (Core UX). The loading state is the very first thing users encounter. Must be polished from MVP.

**Sources:**
- [Transformers.js docs: Model caching](https://huggingface.co/docs/transformers.js/en/index)
- [GitHub Issue: Store models in IndexedDB](https://github.com/xenova/transformers.js/issues/900)

---

### Pitfall 5: JSZip Holding All 100 Processed Images in Memory Simultaneously

**What goes wrong:**
JSZip builds the entire ZIP archive in memory before generating the output Blob. For 100 images at ~2-5 MB each (PNG with transparency), the ZIP construction alone requires 200-500 MB of RAM on top of the already-loaded image Blobs. Combined with WASM inference memory, this can push total page memory to 1+ GB and crash mobile browsers or trigger OOM kills.

**Why it happens:**
JSZip's API is simple -- `zip.file("name.png", blob)` for each file, then `zip.generateAsync()`. It looks harmless, but every call to `zip.file()` retains the data in memory. With 100 large PNGs, this accumulates fast.

**How to avoid:**
- Process images in waves and add to JSZip progressively, but release source Blobs (via `URL.revokeObjectURL()` and nulling references) after adding each to the ZIP.
- Use `zip.generateAsync({type: "blob", streamFiles: true})` to enable streaming compression, which reduces peak memory.
- For extreme cases (100 large images), consider `StreamSaver.js` with ZIP streaming to write directly to disk without holding the full archive in memory.
- Set a reasonable file size limit per image and total batch size. Warn users if estimated ZIP size exceeds ~500 MB.
- Generate ZIP in a Web Worker to avoid main thread freezes during compression.

**Warning signs:**
- Browser tab becoming unresponsive during "Preparing download..." phase
- Download producing a corrupted or 0-byte ZIP file
- "Your computer is low on memory" browser warning

**Phase to address:**
Phase 2 (Batch Download). The batch download feature must be designed with memory budgets in mind. Naive implementation works for 5 images but breaks at 50+.

**Sources:**
- [JSZip: Documented limitations](https://stuk.github.io/jszip/documentation/limitations.html)
- [JSZip Issue #446: Runs out of memory with 20,000 files](https://github.com/Stuk/jszip/issues/446)
- [JSZip Issue #530: 3.5 GB zip causes OOM](https://github.com/Stuk/jszip/issues/530)
- [JSZip Issue #308: Solution for writing large zips](https://github.com/Stuk/jszip/issues/308)

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keeping all processed image Blobs in JS memory until download | Simple state management | 500 MB+ memory for large batches; mobile tab crashes | Never for 100-image target. Store in IndexedDB or use streaming ZIP |
| Using `toDataURL()` instead of `toBlob()` | Returns a string, easy to set as `img.src` | Data URLs are ~33% larger (base64), double memory (string + pixel data), can exceed URL length limits | Never for full-resolution images. Use Blob URLs instead |
| Creating new Web Worker per image | Clean isolation, no state leakage | Worker creation overhead (~50ms each) plus WASM memory leak on termination | Never. Reuse workers |
| Skipping coi-serviceworker for simplicity | Fewer moving parts, no page reload on first visit | 3.4x slower inference permanently, no multithreading | Only if targeting Safari-only (which has its own multithreading bug) |
| Processing images at full resolution through the model | Maximum quality output | RMBG-1.4 internally resizes to 1024x1024 anyway; sending 8000px images wastes memory and transfer time | Never. Resize to model input size for inference, composite mask back to original resolution |
| Storing model files in the app bundle | No CDN dependency, works offline | 45 MB added to repo size, slow git operations, GitHub Pages has 100 MB soft limit per file | Never. Use HuggingFace CDN with Cache Storage caching |

## Integration Gotchas

Common mistakes when connecting components of the pipeline.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Transformers.js + Web Worker | Importing the full library in both main thread and worker, doubling bundle size | Import only in the worker. Main thread communicates via postMessage |
| Canvas + Web Worker | Using OffscreenCanvas without checking browser support (Safari added support only in v16.4+) | Feature-detect OffscreenCanvas. Fallback to main-thread canvas for older Safari |
| postMessage + ImageData | Structured-cloning large ImageData objects (~50 MB for 4K image) takes 200-300ms per transfer | Transfer the underlying ArrayBuffer as a Transferable object: `worker.postMessage({data: imageData.data.buffer}, [imageData.data.buffer])`. Zero-copy, ~6ms |
| JSZip + Blob URLs | Creating Blob URLs for ZIP download but never revoking them -- each leaked URL holds the entire ZIP in memory | Revoke the Blob URL after download starts with a setTimeout (not immediately, or the download breaks). ~3-5 second delay is safe |
| ONNX Runtime + Model Path | Hardcoding HuggingFace CDN URL that changes with model version updates | Use Transformers.js pipeline API which handles URL resolution and versioning automatically |
| File Input + EXIF | Ignoring EXIF orientation metadata, causing photos from phones to appear rotated 90 degrees | Modern browsers (2024+) auto-apply EXIF orientation in `<img>` tags, but `drawImage()` behavior varies. Read EXIF orientation and apply canvas transforms when compositing |

## Performance Traps

Patterns that work at small scale but fail as batch size grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Processing all images concurrently | UI freeze, OOM crash, tab killed | Concurrency queue with max 2 simultaneous workers (project already plans this) | 5+ concurrent images on mobile, 10+ on desktop |
| Loading all dropped files into memory at once via FileReader | Multi-second UI freeze when dropping 100 files, memory spike | Read files lazily -- only when their turn comes in the processing queue. Use `URL.createObjectURL(file)` for thumbnails (no read needed) | 30+ large images dropped at once |
| Rendering 100 full-resolution preview images simultaneously | Layout thrashing, scroll jank, 500+ MB of decoded image memory | Virtualized list (only render visible items). Use thumbnail-sized previews. Decode on-demand with `<img loading="lazy">` | 20+ images in the grid |
| No back-pressure on the processing queue | Queue accepts all 100 images immediately, allocates tracking state for all | Accept images into queue incrementally. Show "X of 100 queued" rather than loading all metadata upfront | 50+ images when each carries 5-10 MB of state |
| Using PNG output for all images regardless of input | PNG files are 3-10x larger than JPEG for photographic content. 100 photos at 5 MB each = 500 MB ZIP | Default to PNG (preserves transparency), but offer WebP option where transparency matters. For solid backgrounds, offer JPEG | When users process photos (not graphics) |

## Security Mistakes

Domain-specific security issues for a client-side image processing tool.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Not validating file types before processing | Malformed files could trigger ONNX/WASM crashes or exploit decoder vulnerabilities | Validate MIME type AND magic bytes (not just extension). Accept only image/png, image/jpeg, image/webp. Reject others with clear error |
| Serving user-selected images via Blob URLs that persist after page close | Memory leak, not a security risk per se, but Blob URLs are scoped to origin | Revoke all Blob URLs on page unload. Track active URLs in a Set |
| Loading ONNX model from third-party CDN without integrity check | Supply-chain attack could swap model file for malicious WASM | Transformers.js uses HuggingFace Hub with content-addressed storage. Verify model hash on first load if paranoia is warranted |
| Exposing processing errors that leak file paths or system info | Privacy leak if error messages contain local file paths | Sanitize all error messages shown to users. Log detailed errors to console only |

## UX Pitfalls

Common user experience mistakes in browser-based image processing tools.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No progress indication during model download | User thinks app is broken, leaves within 10 seconds | Show download progress bar with MB count and "one-time download" messaging |
| No per-image progress during batch processing | User sees "Processing..." for 5 minutes with no feedback on which image or how many remain | Show "Processing image 23 of 100" with individual and overall progress bars |
| Allowing navigation away during processing with no warning | User loses all processed results | Add `beforeunload` event handler warning when processing is active or results exist |
| No error recovery for individual image failures | One corrupted image crashes the whole batch | Catch per-image errors, mark as failed, continue processing remaining. Show which images failed with "retry" option |
| Showing only "Download All" with no individual download option | User processed 100 images but only wants 3 of them | Offer both individual download (click per image) and selective batch download (checkboxes + ZIP) |
| No indication of output quality/resolution | User worries the output is downscaled | Show output resolution next to each result. Confirm "Full resolution preserved" |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Background removal:** Often missing edge refinement around hair/fur -- verify results on portrait photos with complex hair, not just solid-object test images
- [ ] **Batch processing:** Often missing graceful handling of the 101st image (at limit) -- verify what happens when user selects exactly 100, then drags 1 more
- [ ] **Download ZIP:** Often missing proper cleanup -- verify that memory usage returns to baseline after download completes (check browser Task Manager)
- [ ] **Mobile support:** Often missing testing on actual iOS Safari -- verify on a real iPhone, not just Chrome DevTools mobile simulation (canvas memory limits are real-device-only)
- [ ] **First-time experience:** Often missing the cold-cache path -- verify by clearing all site data and testing on a throttled 3G connection
- [ ] **Worker error handling:** Often missing the "worker crashed" recovery path -- verify by simulating OOM inside the worker (process a 10000x10000 canvas)
- [ ] **EXIF orientation:** Often missing rotation handling -- verify with photos taken in portrait orientation on an iPhone (these have EXIF rotation flags)
- [ ] **File type edge cases:** Often missing HEIC/HEIF handling (common on iOS) -- verify what happens when a user drops .heic files (should show clear "unsupported format" message)
- [ ] **Tab backgrounding:** Often missing handling of browser throttling background tabs -- verify that processing continues when the tab is not focused (Web Workers are not throttled, but timers on main thread are)

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Canvas memory ceiling hit on iOS | LOW | Detect the error (try/catch around canvas operations), release all canvases, re-process current image only. Show "Processing one at a time on this device" message |
| WASM memory leak accumulating | MEDIUM | Terminate and recreate the worker after detecting memory growth past a threshold. Accept the ~2 second model reload cost. Reset after every N images (e.g., 25) |
| JSZip OOM during ZIP generation | MEDIUM | Catch the error, fall back to individual file downloads. Show "Batch too large for single download, downloading individually" |
| Model download fails mid-way | LOW | Transformers.js retries automatically. Show retry button if 3 attempts fail. Partial cache is handled by the library |
| Single image crashes inference | LOW | Catch worker error, skip the image, mark as failed in UI, continue batch. Offer "retry" per image |
| coi-serviceworker fails to install | MEDIUM | Detect `crossOriginIsolated === false`, warn user that processing will be slower, continue in single-threaded mode. Never block the app entirely |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| iOS Safari canvas memory ceiling | Phase 1: Core Architecture | Test on real iPhone: process 10 high-res images. Tab must not crash |
| GitHub Pages COOP/COEP headers | Phase 1: Infrastructure | Deploy to GH Pages, confirm `crossOriginIsolated === true` in console |
| Web Worker WASM memory leak | Phase 1: Worker Architecture | Process 50 images, check memory in Task Manager stays under 500 MB |
| Model download UX | Phase 1: Core UX | Clear site data, throttle to Slow 3G, verify progress bar shows and model loads |
| JSZip memory with 100 images | Phase 2: Batch Download | Process and ZIP 100 medium-res images on a phone; download must complete |
| postMessage serialization overhead | Phase 1: Worker Communication | Transfer 4K ImageData, measure: must be <10ms not 200-300ms |
| EXIF orientation | Phase 1: Image Pipeline | Drop 10 iPhone portrait photos, verify none appear rotated |
| Premultiplied alpha lossy round-trip | Phase 1: Compositing Pipeline | Process a PNG with semi-transparent pixels, verify output alpha matches input exactly (pixel-compare) |
| File input performance with 100+ files | Phase 1: File Handling | Drop 100 files, verify UI does not freeze for >500ms |
| No back-pressure on processing queue | Phase 1: Queue System | Queue 100 images, verify memory stays bounded (not all loaded at once) |
| Blob URL memory leaks | Phase 2: Resource Management | Process 50 images, download ZIP, verify Blob URLs are revoked and memory drops |

## Sources

- [PQINA: Total Canvas Memory Use Exceeds The Maximum Limit](https://pqina.nl/blog/total-canvas-memory-use-exceeds-the-maximum-limit)
- [PQINA: Canvas Area Exceeds The Maximum Limit](https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit)
- [Apple Developer Forums: Canvas memory](https://developer.apple.com/forums/thread/687866)
- [GitHub Community: COOP/COEP on GitHub Pages](https://github.com/orgs/community/discussions/13309)
- [Thomas Steiner: COOP/COEP on static hosting](https://blog.tomayac.com/2025/03/08/setting-coop-coep-headers-on-static-hosting-like-github-pages/)
- [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker)
- [ONNX Runtime: Safari inference broken](https://github.com/microsoft/onnxruntime/issues/11567)
- [ONNX Runtime: Performance Diagnosis](https://onnxruntime.ai/docs/tutorials/web/performance-diagnosis.html)
- [ONNX Runtime: Env Flags](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)
- [Chromium Bug 356205: Worker memory leak](https://bugs.chromium.org/p/chromium/issues/detail?id=356205)
- [Firefox Bug 987799: Worker memory leak](https://bugzilla.mozilla.org/show_bug.cgi?id=987799)
- [Transformers.js Issue #860: WebGPU memory leak](https://github.com/huggingface/transformers.js/issues/860)
- [Transformers.js Issue #759: Excessive memory](https://github.com/huggingface/transformers.js/issues/759)
- [JSZip: Limitations](https://stuk.github.io/jszip/documentation/limitations.html)
- [JSZip Issue #446: OOM with many files](https://github.com/Stuk/jszip/issues/446)
- [Transferable Objects: Lightning Fast](https://developer.chrome.com/blog/transferable-objects-lightning-fast)
- [MDN: Transferable Objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)
- [Nolan Lawson: High-Performance Web Worker Messages](https://nolanlawson.com/2016/02/29/high-performance-web-worker-messages/)
- [WHATWG: ImageData alpha premultiplication](https://github.com/whatwg/html/issues/5365)
- [Addy Osmani: bg-remove reference project](https://github.com/addyosmani/bg-remove)
- [MDN: URL.createObjectURL](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static)
- [web.dev: Client-side AI stack](https://web.dev/learn/ai/client-side)

---
*Pitfalls research for: BatchClear.io -- client-side batch AI background removal*
*Researched: 2026-02-19*
