---
phase: 01-foundation
plan: 01
subsystem: infra, ai-pipeline
tags: [vite, react, tailwind, typescript, web-worker, onnx, huggingface, rmbg-1.4, coi-serviceworker, wasm]

# Dependency graph
requires: []
provides:
  - "Vite + React + Tailwind + TypeScript build toolchain"
  - "Cross-origin isolation via coi-serviceworker (COOP/COEP for WASM threading)"
  - "Web Worker inference pipeline with RMBG-1.4 background-removal model"
  - "Typed bidirectional worker message protocol (WorkerInMessage/WorkerOutMessage)"
  - "Safari WASM thread workaround (numThreads=1)"
affects: [01-02, 02-batch-ui, 03-download-deploy]

# Tech tracking
tech-stack:
  added: ["react 19", "react-dom 19", "@huggingface/transformers 3.8", "vite 6", "@vitejs/plugin-react", "tailwindcss 4", "@tailwindcss/vite", "typescript 5.7", "vite-plugin-cross-origin-isolation"]
  patterns: ["PipelineSingleton lazy-loading", "Typed Worker message protocol", "Transferable ArrayBuffer zero-copy", "coi-serviceworker for static hosting COI"]

key-files:
  created:
    - "package.json"
    - "vite.config.ts"
    - "tsconfig.json"
    - "tsconfig.app.json"
    - "tsconfig.node.json"
    - "index.html"
    - "public/coi-serviceworker.js"
    - "src/main.tsx"
    - "src/index.css"
    - "src/vite-env.d.ts"
    - "src/components/App.tsx"
    - "src/lib/types.ts"
    - "src/workers/inference.worker.ts"
    - "vite-env.d.ts"
    - ".gitignore"
  modified: []

key-decisions:
  - "Wrote all project files manually instead of using npm create vite for full control"
  - "Used Record<string, unknown> cast for HF progress callback to handle discriminated union safely"
  - "Used any-typed Segmenter wrapper to avoid TS2590 pipeline union explosion"
  - "Added vite-env.d.ts at project root for vite-plugin-cross-origin-isolation type declaration"

patterns-established:
  - "PipelineSingleton: lazy-load ML model once, reuse across inference calls via nullish coalescing assignment"
  - "Worker message protocol: discriminated union types for type-safe postMessage communication"
  - "Transferable pattern: zero-copy ArrayBuffer transfer from worker to main thread"
  - "Safari detection: UA sniffing for WebKit-specific WASM workaround"

# Metrics
duration: 4min
completed: 2026-02-19
---

# Phase 1 Plan 1: Project Scaffold + AI Pipeline Summary

**Vite/React/Tailwind/TypeScript scaffold with cross-origin isolation and RMBG-1.4 Web Worker inference pipeline using @huggingface/transformers**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-19T09:56:28Z
- **Completed:** 2026-02-19T10:00:42Z
- **Tasks:** 2/2
- **Files created:** 16

## Accomplishments

- Complete Vite + React 19 + Tailwind v4 + TypeScript 5.7 project scaffold with clean build
- Cross-origin isolation configured via both Vite dev plugin and coi-serviceworker.js for production/static hosting
- Web Worker inference pipeline with PipelineSingleton pattern for RMBG-1.4 (q8 quantized) background-removal model
- Typed bidirectional message protocol covering model loading, download progress, inference request/response, and error handling
- Safari WASM threading workaround (numThreads=1) to prevent DataCloneError
- Zero-copy Transferable ArrayBuffer for efficient mask data transfer from worker to main thread

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Vite + React + Tailwind + TypeScript project** - `895a6a4` (feat)
2. **Task 2: Web Worker inference pipeline with RMBG-1.4** - `9119061` (feat)

## Files Created/Modified

- `package.json` - Project manifest with React 19, @huggingface/transformers, Vite 6, Tailwind v4
- `vite.config.ts` - Vite config with react, tailwindcss, crossOriginIsolation plugins; base URL for GitHub Pages; ESM worker format
- `tsconfig.json` - Project references root config
- `tsconfig.app.json` - App TypeScript config with ES2020, WebWorker lib, strict mode, react-jsx
- `tsconfig.node.json` - Node/Vite TypeScript config with ES2022
- `index.html` - HTML entry with coi-serviceworker script in head before module script
- `public/coi-serviceworker.js` - Service worker injecting COOP/COEP headers for static hosting (118 lines)
- `src/main.tsx` - React 19 entry point with StrictMode
- `src/index.css` - Tailwind v4 import with body reset
- `src/vite-env.d.ts` - Vite client type reference
- `src/components/App.tsx` - Root component with crossOriginIsolated status indicator
- `src/lib/types.ts` - WorkerInMessage, WorkerOutMessage, ModelStatus, DownloadProgress type definitions
- `src/workers/inference.worker.ts` - PipelineSingleton with RMBG-1.4, progress forwarding, Safari workaround, Transferable response
- `vite-env.d.ts` - Type declaration for vite-plugin-cross-origin-isolation
- `.gitignore` - Excludes node_modules and dist

## Decisions Made

- **Manual scaffold over npm create vite:** Full control over every config file ensures exact setup needed for cross-origin isolation and worker bundling
- **Record<string, unknown> for progress callback:** The @huggingface/transformers ProgressInfo is a discriminated union where not all members share the same fields; casting to Record avoids property access errors while maintaining safety
- **any-typed Segmenter wrapper:** The pipeline() return type produces a TS2590 "union too complex" error when fully typed; wrapping in a simple callable type sidesteps this while keeping runtime behavior correct
- **Separate vite-env.d.ts at project root:** vite-plugin-cross-origin-isolation has no @types package; declaring the module in a .d.ts included by tsconfig.node.json resolves the TS7016 error

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added .gitignore file**
- **Found during:** Task 1 (project scaffold)
- **Issue:** No .gitignore existed; node_modules and dist would be committed
- **Fix:** Created .gitignore excluding node_modules, dist, *.local
- **Files modified:** .gitignore
- **Verification:** git status no longer shows node_modules or dist as untracked
- **Committed in:** 895a6a4 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed TypeScript compilation errors in worker**
- **Found during:** Task 2 (worker pipeline)
- **Issue:** Multiple TS errors: env.backends.onnx.wasm possibly undefined (TS18048), pipeline return type too complex (TS2590), ProgressInfo union property access errors (TS2339), missing vite-plugin-cross-origin-isolation types (TS7016)
- **Fix:** Added optional chaining for env.backends, used any-typed Segmenter wrapper, cast progress to Record<string, unknown>, created vite-env.d.ts type declaration
- **Files modified:** src/workers/inference.worker.ts, vite-env.d.ts, tsconfig.node.json
- **Verification:** `npx tsc -b` passes with zero errors
- **Committed in:** 9119061 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correct TypeScript compilation. No scope creep.

## Issues Encountered

None beyond the TypeScript type issues documented above as deviations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Build toolchain fully operational (dev + production builds)
- Worker inference pipeline ready for integration with UI in Plan 02
- Plan 02 will wire the worker to the React UI, verify crossOriginIsolated === true in browser, and test actual model loading + inference
- The `new URL()` pattern for worker instantiation will be created in Plan 02

## Self-Check: PASSED

- [x] package.json exists on disk
- [x] vite.config.ts exists on disk
- [x] src/workers/inference.worker.ts exists on disk
- [x] src/lib/types.ts exists on disk
- [x] git log shows 2 commits matching "01-01" (895a6a4, 9119061)

---
*Phase: 01-foundation*
*Completed: 2026-02-19*
