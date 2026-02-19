# Project Research Summary

**Project:** BatchClear.io
**Domain:** Client-side batch AI image background removal (browser-only, zero backend)
**Researched:** 2026-02-19
**Confidence:** HIGH

## Executive Summary

BatchClear.io is a fully client-side, privacy-first batch background removal tool that runs AI inference directly in the browser using WebAssembly. The established approach for this domain is: ONNX model inference via `@huggingface/transformers` v3 inside a Web Worker singleton, a concurrency-controlled queue (max 2 simultaneous), full-resolution Canvas API compositing, and fflate-based ZIP download — all deployed as a static Vite SPA to GitHub Pages. The competitive landscape confirms a genuine market gap: no existing free tool combines client-side privacy, batch processing of 100 images, AND ZIP download in a single product. The closest competitor (NoBG.space) is client-side but lacks ZIP export and true batch queueing.

The recommended tech stack is well-validated and production-proven. React 19 + Vite 7 + Tailwind 4 + TypeScript 5.9 provides the UI layer. The RMBG-1.4 model at 8-bit quantized ONNX (~45MB) is the only browser-compatible general-purpose background removal model available today — RMBG-2.0 has a confirmed onnxruntime-web bug and cannot run in browsers. Use `@huggingface/transformers` (not the deprecated `@xenova/transformers`). Zustand handles state with a slice pattern across image list, model status, and settings.

The two highest-consequence risks are both architectural and must be designed in from day one, not retrofitted: (1) iOS Safari enforces a hard canvas memory ceiling (~224-384 MB) that silently crashes tabs — the solution is reusing a single OffscreenCanvas and immediately extracting results as Blobs; (2) GitHub Pages cannot set COOP/COEP headers required for SharedArrayBuffer/multithreading, causing 3.4x inference slowdown — the solution is `coi-serviceworker` deployed with the app. Both issues are invisible in local dev (Chrome, fast connection, warm cache) and only surface in production on real devices.

## Key Findings

### Recommended Stack

The stack is fully determined with high confidence across all layers. The critical call is `@huggingface/transformers` v3.8.x with RMBG-1.4 at q8 quantization — this is the only combination that works in browsers today. Vite 7's native Web Worker import syntax (`?worker`) makes the worker architecture straightforward. Tailwind v4 requires zero PostCSS config in Vite. fflate replaces JSZip for ZIP generation: it's 40x faster, 8kB, and uses true async worker threads (JSZip blocks the main thread despite its async API). See `STACK.md` for full version matrix and compatibility table.

**Core technologies:**
- `@huggingface/transformers` v3.8.x: ML inference in-browser via ONNX Runtime — only non-deprecated transformers.js package; v4 is preview-only
- `briaai/RMBG-1.4` (q8 ONNX, ~45MB): background removal model — only browser-compatible option; RMBG-2.0 has unresolved browser bug
- React 19 + Vite 7 + TypeScript 5.9: UI/build foundation — React 19 hooks match component needs; Vite 7 has native Web Worker support
- Tailwind CSS v4.2: styling — v4 is 5-100x faster builds, zero PostCSS config with Vite
- fflate v0.8: ZIP generation — replaces JSZip; async, 40x faster, no main thread blocking
- react-dropzone v15: drag-and-drop upload — hooks-based, handles validation, accessibility
- Zustand: state management — slice pattern for image list, model status, settings (not in original stack table but confirmed in ARCHITECTURE.md)

**Critical version warnings:**
- Do NOT use `@xenova/transformers` — deprecated, unmaintained since 2+ years ago
- Do NOT use RMBG-2.0 in browser — known onnxruntime-web bug, no quantized variant, 513MB fp16
- Do NOT use TypeScript 6.0 — still in beta; use 5.9.x
- Do NOT use ESLint legacy config (`.eslintrc`) — removed in ESLint 10

### Expected Features

The competitive analysis covers 15+ tools. The unique positioning is clear: BatchClear.io is the only free, client-side, batch tool (100 images) with ZIP download. See `FEATURES.md` for full competitor matrix and prioritization table.

**Must have (table stakes) — all P1:**
- Drag-and-drop + click-to-browse upload (every competitor has this)
- Batch multi-file upload, target 100 images
- AI background removal via RMBG-1.4 — the core value
- Model download progress bar (45MB, 30-60s on first load — users abandon without it)
- Model caching (Cache API / IndexedDB — subsequent visits are instant)
- Transparent PNG output at original resolution
- White background JPG output (e-commerce: Amazon/Etsy require pure white)
- Per-image progress states: Queued / Processing / Done / Error
- Concurrency queue (max 2 simultaneous, rest queued)
- Individual image download buttons
- Batch ZIP download
- Before/after preview (toggle or slider)
- Dark/light theme with persistent preference
- Responsive layout (desktop-first, mobile-functional)
- Checkerboard transparency preview

**Should have (competitive differentiators) — P2:**
- Custom background color picker (beyond just white)
- Smart file naming in ZIP (`originalname_nobg.png`)
- Queue visualization (visual pipeline showing active/waiting/done states)
- Keyboard shortcuts (Ctrl+A, Delete, Enter for power users)
- Output format selection (PNG vs WebP)

**Defer (v2+) — P3:**
- PWA / offline mode (model caching already provides it, but service worker adds complexity)
- WebGPU acceleration (Chrome 113+ only, 2-4x speedup — validate demand first)
- Folder upload support
- Session persistence via IndexedDB

**Anti-features to avoid entirely:**
- Manual brush/eraser refinement — transforms into image editor, massive scope creep
- Background replacement with images — requires server-side AI for quality
- API / developer integration — requires backend, violates zero-backend constraint
- Cloud sync / history — requires accounts, storage, GDPR overhead

### Architecture Approach

The architecture has five clear layers with strict boundaries: UI Layer (React components) → State Layer (Zustand store with 3 slices) → Processing Layer (concurrency queue manager, plain TypeScript) → Worker Layer (Web Worker with Pipeline Singleton, no React) → Compositing Layer (OffscreenCanvas + Canvas API). The Worker layer is completely isolated — it only imports `@huggingface/transformers` and communicates via postMessage. Image data crosses the main-thread/worker boundary as Transferable ArrayBuffers (zero-copy, ~6ms vs 200-300ms for structured clone). See `ARCHITECTURE.md` for full code examples and data flow diagrams.

**Major components:**
1. **Web Worker (inference.worker.ts)** — Pipeline Singleton pattern; loads RMBG-1.4 once, reuses for all images; reports download progress; never recreated (WASM memory leak on termination)
2. **Queue Manager (lib/queue.ts)** — Plain TypeScript, not React; concurrency controller (max 2); reads File lazily (only when queue slot opens); dispatches to Worker via postMessage
3. **Compositor (lib/compositor.ts)** — OffscreenCanvas at original image dimensions; scales mask from model resolution (1024x1024) to original; applies mask to alpha channel pixel-by-pixel; exports Blob (PNG or JPG)
4. **Zustand Store** — 3 slices: `imageSlice` (image array with status/progress/resultBlob), `modelSlice` (download progress, ready state), `settingsSlice` (background mode, theme)
5. **ZIP Builder (lib/zip.ts)** — fflate-based; collects result Blobs; generates ZIP in worker thread; triggers download; revokes Blob URL after 3-5s delay
6. **UI Components** — DropZone, ImageGrid, ImageCard, Controls, DownloadBar, ProgressBar (pure rendering, no business logic)

**Recommended file structure:**
```
src/
  components/   # React UI (DropZone, ImageGrid, ImageCard, Controls, DownloadBar)
  store/        # Zustand slices (imageSlice, modelSlice, settingsSlice)
  workers/      # inference.worker.ts (isolated, no React)
  lib/          # queue.ts, compositor.ts, zip.ts, types.ts (no React)
  hooks/        # useWorker.ts, useQueue.ts (bridge lib <-> components)
```

**Build order the architecture implies:** Foundation → Worker + Pipeline → Compositor → DropZone + Store → Queue Manager → Full UI → ZIP Download → Polish + Deploy

### Critical Pitfalls

All 5 critical pitfalls are HIGH confidence, verified against browser bug trackers and official docs. See `PITFALLS.md` for recovery strategies and full verification checklists.

1. **iOS Safari canvas memory ceiling (~224-384 MB)** — Reuse a single OffscreenCanvas pool (max 2); immediately extract result as Blob after each image; display results via `<img>` tags pointing to Blob URLs, never via live canvases; test on a real iPhone not Chrome DevTools simulation

2. **GitHub Pages blocks COOP/COEP headers (3.4x inference slowdown)** — Deploy `coi-serviceworker` to inject headers via service worker; this causes a one-time page reload on first visit (acceptable); for Safari: force `ort.env.wasm.numThreads = 1` (separate Safari bug with SharedArrayBuffer DataCloneError); test on actual GitHub Pages not `vite preview`

3. **Web Worker WASM memory leak on termination** — Create workers once at app startup, reuse forever; never create/terminate per image; within worker, reuse the ONNX InferenceSession across all images; if recovery needed, call `session.release()` before termination

4. **Model download UX on first load (45MB, up to 60s on mobile)** — Hook into Transformers.js `progress_callback`; show MB downloaded / total + "one-time download" messaging; lazy-load: let users select images first, start download immediately while queue forms; show "Model ready" badge for returning users

5. **JSZip / fflate holding all 100 processed image Blobs in memory simultaneously** — Add images to ZIP progressively; release source Blobs after adding each; use `streamFiles: true` option; warn users if estimated ZIP exceeds ~500MB; fall back to individual downloads on OOM

## Implications for Roadmap

Based on research, the architecture's dependency layers map cleanly to 4 phases. The PITFALLS.md pitfall-to-phase mapping explicitly calls out which pitfalls must be addressed in Phase 1 vs Phase 2.

### Phase 1: Foundation + Core Engine

**Rationale:** Everything else depends on the Web Worker pipeline being proven. Architecture research explicitly recommends validating the Worker + Pipeline before adding UI complexity. Three of the five critical pitfalls (iOS canvas ceiling, WASM memory leak, COOP/COEP headers) must be addressed in this phase — they cannot be retrofitted.

**Delivers:** Working end-to-end pipeline for a single image: drop one image, get back a processed Blob with transparent background. No polish, minimal UI.

**Addresses (from FEATURES.md P1):**
- AI background removal via RMBG-1.4 in Web Worker
- Model download with progress indicator
- Model caching (Cache API)
- Transparent PNG output
- Concurrency queue scaffolding (max 2)

**Avoids (from PITFALLS.md):**
- iOS Safari canvas memory ceiling — design single OffscreenCanvas reuse from day one
- WASM memory leak — create Worker singleton at startup, never terminate
- COOP/COEP multithreading — deploy `coi-serviceworker` before benchmarking
- Main-thread inference (architecture anti-pattern) — Worker isolation is Phase 1 design

**Infrastructure deliverables:** Vite + React + Tailwind + TypeScript scaffold; Zustand store skeleton; `coi-serviceworker` configured; GitHub Pages base URL configured; ESLint flat config

### Phase 2: Batch Upload + Full UI

**Rationale:** Once the processing pipeline is proven with a single image, wire it to real user input (file drop) and state management. This phase connects the engine to the UI. The concurrency queue, per-image progress states, and all rendering components come here.

**Delivers:** Full batch upload and processing workflow: drop up to 100 images, see per-image status (Queued/Processing/Done/Error), individual download buttons.

**Addresses (from FEATURES.md P1):**
- Drag-and-drop + click-to-browse upload
- Batch multi-file upload (100 image limit)
- Per-image progress states
- Individual image download
- Before/after preview (toggle)
- Checkerboard transparency preview
- White background JPG output
- Dark/light theme
- Responsive layout

**Implements (from ARCHITECTURE.md):**
- DropZone component with react-dropzone
- ImageGrid + ImageCard components
- Controls component (background mode, theme)
- Queue Manager with lazy File reading
- Full Zustand store (all 3 slices wired)

**Avoids (from PITFALLS.md):**
- Loading all 100 files into memory at upload — read Files lazily, only on queue dispatch
- Rendering 100 full-resolution previews — use thumbnail-sized previews (`URL.createObjectURL` is zero-copy)
- No back-pressure on queue — queue accepts files but reads lazily

### Phase 3: Batch Download + Polish

**Rationale:** ZIP download requires all processing to work first. This phase also addresses the JSZip/fflate memory pitfall which appears at batch scale. Polish features (keyboard shortcuts, queue visualization) belong here after core functionality is validated.

**Delivers:** Batch ZIP download; P2 differentiator features; performance polish; full mobile testing pass.

**Addresses (from FEATURES.md):**
- Batch ZIP download via fflate (P1 — but depends on Phase 2 completion)
- Custom background color picker (P2)
- Smart file naming in ZIP (P2)
- Queue visualization (P2)
- Keyboard shortcuts (P2)

**Uses (from STACK.md):**
- fflate v0.8 for ZIP generation (async, worker-threaded — not JSZip)
- file-saver if native `<a download>` insufficient for cross-browser

**Avoids (from PITFALLS.md):**
- JSZip memory OOM with 100 images — use fflate's streaming approach; release Blobs after ZIP entry added
- Blob URL leaks — revoke after download (with 3-5s delay)

**Verification:** Process and ZIP 100 medium-res images on a real iPhone; download must complete without tab crash.

### Phase 4: Deploy + Validate

**Rationale:** GitHub Pages deployment has specific constraints (base URL, WASM MIME types, COOP/COEP workaround). A dedicated phase ensures production behavior is verified, not assumed. PWA/offline is a v2+ feature per FEATURES.md and belongs here only as a stretch goal.

**Delivers:** Live app on GitHub Pages; verified cross-browser compatibility; production performance benchmarks; stretch: PWA manifest + service worker for offline capability.

**Addresses (from FEATURES.md P3):**
- PWA / offline mode (stretch goal — model caching already provides most of this)

**Critical checks (from PITFALLS.md):**
- Confirm `crossOriginIsolated === true` on deployed site (not just local dev)
- Test cold-cache path: clear all site data, throttle to Slow 3G, verify model load progress
- Test on real iPhone (not Chrome DevTools): 10 high-res images, no tab crash
- EXIF orientation: drop 10 iPhone portrait photos, verify no rotation artifacts
- HEIC/HEIF files: confirm clear "unsupported format" error shown

### Phase Ordering Rationale

- **Foundation before UI** — The Worker + Pipeline is the riskiest dependency. ARCHITECTURE.md explicitly recommends validating it with a hardcoded image before any UI complexity. Discovering the Worker doesn't work as expected after building the full UI would be very costly.
- **Worker patterns locked in Phase 1** — Three of five critical pitfalls require architectural decisions that cannot be safely retrofitted: canvas memory pooling, Worker singleton lifecycle, and COOP/COEP service worker. These must be Phase 1 choices.
- **Batch upload before batch download** — ZIP download requires processed result Blobs to exist; processing requires the upload/queue system. The dependency is strict.
- **Deploy as a dedicated phase** — GitHub Pages has deployment-specific behaviors (base URL, header constraints, WASM MIME types) that are invisible in `vite preview`. Production verification is a distinct task, not an afterthought.

### Research Flags

**Phases likely needing deeper research during planning:**

- **Phase 1 — `background-removal` pipeline output format:** ARCHITECTURE.md flags an explicit validation point — does the `pipeline("background-removal", "briaai/RMBG-1.4")` call return a pre-composited image, or a raw mask requiring manual scaling? This determines the compositor design. Verify during implementation with a real test image before committing to the compositing approach.
- **Phase 1 — EXIF orientation handling:** PITFALLS.md notes that `drawImage()` behavior varies by browser for EXIF-rotated images. Research the exact cross-browser behavior before implementing the compositor.
- **Phase 3 — fflate streaming ZIP API:** STACK.md recommends fflate over JSZip but the streaming ZIP generation API (to avoid holding all Blobs in memory) needs implementation-level validation. The PITFALLS.md streaming approach with `streamFiles: true` is JSZip-specific; confirm fflate's equivalent.

**Phases with well-documented patterns (can skip additional research):**

- **Phase 2 — react-dropzone:** Extremely well-documented library with 4,450+ dependents. Standard hooks-based API. No research needed.
- **Phase 2 — Zustand slice pattern:** Canonical pattern with official documentation. No research needed.
- **Phase 4 — GitHub Pages Vite deployment:** Well-documented in Vite's official static deploy guide. The `base` config and `gh-pages` npm package are straightforward.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against official npm registries and release blogs. Critical call (RMBG-1.4 vs 2.0, @huggingface vs @xenova) confirmed via GitHub issues and official announcements. |
| Features | MEDIUM-HIGH | Based on direct analysis of 15+ competitor products with live verification. Competitive positioning is clear. Some feature priority calls are judgment-based (P1 vs P2 line). |
| Architecture | HIGH | Pipeline Singleton and concurrency queue patterns confirmed via Transformers.js official tutorial and multiple reference implementations. Data flow and component boundaries are well-established. |
| Pitfalls | HIGH | All critical pitfalls verified against browser bug trackers (Chromium, Firefox, WebKit), official docs, and GitHub issues. Recovery strategies tested in referenced projects. |

**Overall confidence: HIGH**

### Gaps to Address

- **`background-removal` pipeline output format vs `image-segmentation`:** ARCHITECTURE.md recommends the `background-removal` pipeline task but notes the exact output format (pre-composited vs raw mask, auto-upscaling vs manual) needs implementation-level validation. This is the single most important unknown — it directly affects the compositor design. Plan a spike in Phase 1 week 1.

- **fflate streaming ZIP API design:** STACK.md selects fflate over JSZip for memory safety, but the exact API for streaming/progressive ZIP generation with Blob inputs needs validation. The PITFALLS.md mitigation references JSZip's `streamFiles: true` option — fflate's equivalent needs to be confirmed before Phase 3 implementation.

- **Safari EXIF orientation behavior with `drawImage()`:** PITFALLS.md flags this as a "looks done but isn't" issue. Modern browsers auto-apply EXIF orientation in `<img>` tags but Canvas `drawImage()` behavior varies. Needs a targeted test during Phase 1 compositing work to determine if manual EXIF handling is required.

- **WebGPU availability detection and graceful fallback:** WebGPU provides 2-4x inference speedup on Chrome 113+ but `crossOriginIsolated` is required and WASM fallback must work silently. The detection and fallback path should be designed in Phase 1 even if WebGPU features are Phase 4+ stretch goals.

## Sources

### Primary (HIGH confidence)
- [npm: @huggingface/transformers](https://www.npmjs.com/package/@huggingface/transformers) — v3.8.1 confirmed latest stable
- [Transformers.js Official Documentation](https://huggingface.co/docs/transformers.js/en/index) — Worker singleton, model caching
- [Transformers.js React Tutorial](https://huggingface.co/docs/transformers.js/tutorials/react) — Worker + Singleton pattern
- [Background-Removal Pipeline PR #1216](https://github.com/huggingface/transformers.js/pull/1216) — confirms `background-removal` task type
- [Vite 7.0 announcement](https://vite.dev/blog/announcing-vite7) — v7.3.1 latest stable
- [Tailwind CSS v4.0 blog](https://tailwindcss.com/blog/tailwindcss-v4) — v4.2.0 latest, zero-config Vite integration
- [ESLint v10.0.0 released](https://eslint.org/blog/2026/02/eslint-v10.0.0-released/) — flat config only going forward
- [PQINA: Total Canvas Memory Use Exceeds Maximum Limit](https://pqina.nl/blog/total-canvas-memory-use-exceeds-the-maximum-limit) — iOS Safari canvas ceiling
- [Thomas Steiner: COOP/COEP on static hosting](https://blog.tomayac.com/2025/03/08/setting-coop-coep-headers-on-static-hosting-like-github-pages/) — GitHub Pages multithreading workaround
- [coi-serviceworker repo](https://github.com/gzuidhof/coi-serviceworker) — COOP/COEP service worker solution
- [MDN: Transferable Objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) — zero-copy ArrayBuffer transfer
- [MDN: OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) — worker-side canvas compositing
- [Chromium Bug 356205](https://bugs.chromium.org/p/chromium/issues/detail?id=356205) — Worker WASM memory leak
- [npm: fflate](https://www.npmjs.com/package/fflate) — v0.8.2, async ZIP generation

### Secondary (MEDIUM confidence)
- [NoBG.space](https://www.nobg.space/) — closest competitor, feature verification
- [BgEraser](https://bgeraser.com/) — batch limit and feature verification
- [briaai/RMBG-2.0 discussions](https://huggingface.co/briaai/RMBG-2.0/discussions/12) — browser bug confirmation
- [bg-remove by Addy Osmani](https://github.com/addyosmani/bg-remove) — reference implementation (React + Transformers.js + RMBG-1.4)
- [JSZip: Limitations](https://stuk.github.io/jszip/documentation/limitations.html) — in-memory OOM risk confirmed
- [Transformers.js Issue #860: WebGPU memory leak](https://github.com/huggingface/transformers.js/issues/860) — memory management validation
- [HN: client-side AI background remover](https://news.ycombinator.com/item?id=46870958) — community validation of approach

### Tertiary (for reference)
- [IMG.LY background-removal-js](https://github.com/imgly/background-removal-js) — alternative library approach (not recommended for this project)
- [LogRocket: Background Remover with Vue + Transformers.js](https://blog.logrocket.com/building-background-remover-vue-transformers-js/) — confirms Canvas compositing data flow

---
*Research completed: 2026-02-19*
*Ready for roadmap: yes*
