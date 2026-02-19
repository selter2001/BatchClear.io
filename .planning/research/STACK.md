# Stack Research

**Domain:** Client-side batch image background removal web app (browser AI)
**Researched:** 2026-02-19
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React | 19.2.x | UI framework | Latest stable. Hooks-based architecture matches component needs (dropzone, progress, gallery). Massive ecosystem for file handling and UI patterns. |
| Vite | 7.3.x | Build tool / dev server | Latest stable. Sub-second HMR. Native Web Worker support via `?worker` imports. Excellent static-site build output for GitHub Pages. |
| TypeScript | 5.9.x | Type safety | Latest stable (5.9.3). Use 5.9, not 6.0 beta. Strong typing for complex worker message protocols and image processing pipelines. |
| Tailwind CSS | 4.2.x | Styling | Latest stable. v4 is a ground-up rewrite: 5x faster full builds, 100x faster incremental builds. Zero-config setup -- just `@import "tailwindcss"`. Built on CSS cascade layers and `@property`. |
| @huggingface/transformers | 3.8.x | ML inference in browser | Latest stable v3. Runs ONNX models in-browser via ONNX Runtime. Supports Web Workers. **Use `@huggingface/transformers`, NOT `@xenova/transformers`** -- the `@xenova` package is deprecated at v2.17.2 and unmaintained. |

### AI / Model Layer

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| briaai/RMBG-1.4 (ONNX quantized) | 1.4 (q8) | Background removal model | 8-bit quantized ONNX is ~45MB -- small enough for browser download. Works in all modern browsers. Cross-browser compatible including iOS Safari. RMBG-2.0 is better quality but NOT browser-compatible yet (onnxruntime-web bug). |
| ONNX Runtime Web | (bundled with transformers.js) | ML runtime | WebAssembly backend for broad compatibility. WebGPU backend available for 2-4x speedup on supported browsers (Chrome 113+, Edge 113+). Falls back gracefully to WASM. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fflate | 0.8.x | ZIP file generation | For batch ZIP download of processed images. 8kB minified, 40x faster than JSZip, true async via worker threads (JSZip blocks main thread despite async API). Tree-shakeable. |
| react-dropzone | 15.x | Drag-and-drop file input | For the image upload zone. Headless (no UI opinions), hooks-based API, handles file type filtering and validation. 4,450+ dependents. |
| lucide-react | 0.574.x | Icons | Tree-shakeable SVG icons. Consistent design language. Lighter than react-icons (which bundles multiple icon sets). |
| file-saver | 2.0.x | Trigger browser downloads | For saving individual processed images and ZIP files. 5M+ weekly downloads, battle-tested cross-browser. Only needed if native `<a download>` is insufficient. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| @vitejs/plugin-react | 5.1.x | React Fast Refresh + JSX transform for Vite. Use the Babel variant (not SWC) for maximum compatibility. |
| ESLint | 9.x (flat config) | Linting. Use flat config (`eslint.config.js`). Do NOT use eslintrc format -- deprecated in 9, removed in 10. |
| gh-pages | 6.x | GitHub Pages deployment | `gh-pages -d dist` deploys the Vite build output. Alternative: GitHub Actions workflow with `peaceiris/actions-gh-pages`. |

## Installation

```bash
# Core
npm install react react-dom @huggingface/transformers react-dropzone fflate lucide-react

# Dev dependencies
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom tailwindcss eslint gh-pages
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| @huggingface/transformers v3 | @huggingface/transformers v4 (next) | v4 is preview-only (`npm i @huggingface/transformers@next`). Better WebGPU runtime, 53% smaller web bundle, 10x faster builds. Adopt when stable -- likely Q2 2026. For now, v3.8.x is production-ready. |
| RMBG-1.4 | RMBG-2.0 | RMBG-2.0 has 90%+ success rate vs 74% for 1.4. But its ONNX model is ~513MB (fp16) vs 45MB (1.4 quantized), and it has a known onnxruntime-web browser bug. Revisit when browser support lands. |
| RMBG-1.4 | MODNet / BEN2-ONNX | MODNet is portrait-only (not general purpose). BEN2 is emerging but less battle-tested for browser deployment. RMBG-1.4 has the best general-purpose browser track record. |
| fflate | JSZip 3.10.x | JSZip has 10K+ GitHub stars and broader name recognition. Use if team already knows JSZip. But JSZip is 4 years stale, blocks main thread during compression (bad for batch of 100 images), and is heavier. |
| fflate | client-zip | client-zip is tiny (2.6kB gzipped) and streaming. Use if you need progressive ZIP generation. But it has only 97K weekly downloads vs fflate's 16M, and Chrome performance is worse due to WHATWG Streams overhead. |
| Tailwind CSS v4 | Plain CSS / CSS Modules | Use plain CSS if team prefers it. But Tailwind v4 with Vite has zero config overhead and enables rapid UI iteration for a utility-heavy app like this. |
| react-dropzone | Native drag-and-drop | Use native HTML5 DnD if you want zero dependencies. But react-dropzone handles edge cases (file type validation, directory drops, accessibility) that take significant effort to replicate. |
| Vite 7 | Vite 8 beta | Vite 8 uses Rolldown (Rust bundler) replacing esbuild+Rollup. Potentially faster builds. But still in beta. Use Vite 7.3.x for stability. |
| @vitejs/plugin-react (Babel) | @vitejs/plugin-react-swc | SWC variant is faster in dev. Use it if you don't need Babel plugins. For this project, either works -- the SWC variant is a valid choice for faster refresh. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@xenova/transformers` | Deprecated. Last release (2.17.2) was 2+ years ago. No WebGPU support. No bug fixes. The maintainer moved everything to `@huggingface/transformers`. | `@huggingface/transformers` v3.8.x |
| RMBG-2.0 in browser | Known onnxruntime-web bug prevents browser execution. Model is 513MB fp16 (no quantized variant available for browser). | RMBG-1.4 with 8-bit quantized ONNX (~45MB) |
| JSZip for batch operations | Blocks main thread during compression despite async API. For 100 images, this causes UI freezes. Last published 4 years ago. | fflate (true async via worker threads, 40x faster) |
| TensorFlow.js | Heavier runtime, worse model ecosystem for background removal. RMBG models are ONNX-native, not TF-native. Would require model conversion with quality loss. | @huggingface/transformers (ONNX Runtime Web) |
| Next.js / Remix | Adds server-side complexity to a fully static, zero-backend app. Overkill for GitHub Pages deployment. Larger bundle, slower builds. | Vite (pure SPA, static output) |
| ESLint legacy config (.eslintrc) | Deprecated in ESLint 9, fully removed in ESLint 10. Will break on next major upgrade. | ESLint flat config (`eslint.config.js`) |
| Webpack | Slower builds, more complex config, no native Web Worker support via imports. Vite has won the build tool war for new projects. | Vite 7.x |

## Stack Patterns by Variant

**If targeting maximum browser compatibility (including older Safari/iOS):**
- Use WASM backend only (skip WebGPU)
- Use RMBG-1.4 (confirmed working on iOS Safari 16.4+)
- Use `file-saver` for downloads (some older browsers lack `<a download>` support)

**If targeting modern Chrome/Edge for best performance:**
- Enable WebGPU backend in transformers.js for 2-4x inference speedup
- Use OffscreenCanvas in Web Workers for image pre/post-processing
- Can skip `file-saver` and use native download attributes

**If images exceed 100 in batch:**
- Consider streaming ZIP generation with `client-zip` instead of `fflate`
- Implement queue-based processing with configurable concurrency
- Add IndexedDB caching for processed images to handle memory pressure

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| @huggingface/transformers@3.8.x | Vite 7.x | Works out of the box. Vite handles ONNX WASM file serving. May need `optimizeDeps.exclude` config for the ONNX runtime. |
| Tailwind CSS 4.2.x | Vite 7.x | Native Vite integration via `@import "tailwindcss"`. No PostCSS plugin needed (v4 has its own engine). |
| React 19.x | @vitejs/plugin-react 5.x | Full support. Plugin handles JSX transform and Fast Refresh. |
| TypeScript 5.9.x | Vite 7.x | Vite uses esbuild for TS transpilation (type checking is separate via `tsc --noEmit`). |
| ESLint 9.x | typescript-eslint 8.x | Use `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` v8 for flat config support. |
| react-dropzone 15.x | React 19.x | Hooks-based API, requires React 16.8+. Fully compatible. |

## Critical Technical Notes

### Web Worker Architecture
Transformers.js model loading and inference MUST run in a Web Worker to prevent UI freezes. The model download (~45MB) and per-image inference (1-3 seconds) would block the main thread entirely. Vite supports `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` natively.

### Model Caching
The ONNX model is cached by the browser after first download (transformers.js uses Cache API internally). Second visits skip the 45MB download entirely. This is critical for UX -- first load is slow, subsequent loads are instant.

### Memory Management for Batch Processing
Processing 100 images concurrently would exhaust browser memory. Implement a sequential or limited-concurrency queue (2-4 concurrent). Release image data (URL.revokeObjectURL, nullify references) after each image is processed and added to the ZIP buffer.

### GitHub Pages Constraints
- Static files only (no server-side rendering, no API routes)
- Set `base` in `vite.config.ts` to `'/<repo-name>/'` if deploying to `username.github.io/repo-name`
- ONNX WASM files must be served with correct MIME types (GitHub Pages handles this)
- Total repo size limit: 1GB (model files should NOT be in the repo -- they're fetched from Hugging Face CDN at runtime)

## Sources

- [npm: @huggingface/transformers](https://www.npmjs.com/package/@huggingface/transformers) -- v3.8.1 confirmed as latest stable (HIGH confidence)
- [Transformers.js v4 Preview blog post](https://huggingface.co/blog/transformersjs-v4) -- v4 is preview/next only (HIGH confidence)
- [Xenova: Remove Background Web](https://huggingface.co/posts/Xenova/262978955052408) -- RMBG-1.4 at ~45MB quantized, cross-browser (HIGH confidence)
- [briaai/RMBG-2.0 discussions](https://huggingface.co/briaai/RMBG-2.0/discussions/12) -- RMBG-2.0 browser bug confirmed (MEDIUM confidence)
- [Vite 7.0 announcement](https://vite.dev/blog/announcing-vite7) -- v7.3.1 latest stable (HIGH confidence)
- [npm: vite](https://www.npmjs.com/package/vite) -- v7.3.1 (HIGH confidence)
- [Tailwind CSS v4.0 blog](https://tailwindcss.com/blog/tailwindcss-v4) -- v4.2.0 latest (HIGH confidence)
- [npm: react](https://www.npmjs.com/package/react) -- v19.2.4 latest (HIGH confidence)
- [npm: fflate](https://www.npmjs.com/package/fflate) -- v0.8.2, 8kB, async worker threads (HIGH confidence)
- [npm: react-dropzone](https://www.npmjs.com/package/react-dropzone) -- v15.0.0 latest (HIGH confidence)
- [npm: lucide-react](https://www.npmjs.com/package/lucide-react) -- v0.574.0 latest (HIGH confidence)
- [GitHub: transformers.js issue #1291](https://github.com/huggingface/transformers.js/issues/1291) -- @xenova deprecated, use @huggingface (HIGH confidence)
- [TypeScript 6.0 Beta announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0-beta/) -- 5.9.3 is latest stable (HIGH confidence)
- [ESLint v10.0.0 released](https://eslint.org/blog/2026/02/eslint-v10.0.0-released/) -- flat config is the only format going forward (HIGH confidence)
- [Vite static deploy docs](https://vite.dev/guide/static-deploy) -- GitHub Pages deployment guide (HIGH confidence)
- [OffscreenCanvas MDN](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) -- available in Web Workers, broad browser support (HIGH confidence)
- [HN: client-side AI background remover](https://news.ycombinator.com/item?id=46870958) -- community validation of approach (MEDIUM confidence)

---
*Stack research for: BatchClear.io -- client-side batch background removal*
*Researched: 2026-02-19*
