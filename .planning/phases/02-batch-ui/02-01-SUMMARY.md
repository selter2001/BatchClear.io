---
phase: 02-batch-ui
plan: 01
subsystem: batch-processing, ui, queue
tags: [react-dropzone, p-limit, useReducer, batch-state, concurrency-queue, compositor, blob-url, heic]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Web Worker inference pipeline with RMBG-1.4, typed message protocol"
  - phase: 01-02
    provides: "Canvas compositor, single-image drop UI, HEIC support, Blob URL lifecycle"
provides:
  - "Multi-file drag-and-drop upload via react-dropzone (up to 100 images)"
  - "useReducer batch state machine with full image lifecycle (idle->queued->processing->done/error)"
  - "p-limit concurrency queue gating max 2 simultaneous inference calls"
  - "Compositor extension for white-background JPG output alongside transparent PNG"
  - "HEIC conversion at drop time (before queue entry)"
  - "Blob URL lifecycle management on remove, retry, clear, and unmount"
  - "Individual image retry capability for failed images"
  - "BatchState, BatchAction, ImageItem, ImageStatus, BackgroundMode types"
affects: [02-02, 03-download-deploy]

# Tech tracking
tech-stack:
  added: ["react-dropzone 15.0.0", "p-limit 7.3.0"]
  patterns: ["useReducer batch state machine", "p-limit concurrency gate", "pending inference promise map", "stateRef pattern for async callback access", "HEIC conversion at drop time"]

key-files:
  created:
    - "src/lib/queue.ts"
  modified:
    - "src/lib/types.ts"
    - "src/lib/compositor.ts"
    - "src/components/DropZone.tsx"
    - "src/components/App.tsx"
    - "package.json"

key-decisions:
  - "react-dropzone v15.0.0 installed (latest) instead of v14.4.x -- v15 isDragReject behavior change irrelevant since we use onDropRejected callback"
  - "Both transparent PNG and white-background JPG generated at processing time (not on toggle) for instant preview switching"
  - "Pending inference promise map pattern for typed async worker communication"
  - "stateRef pattern to avoid stale closures in async processOneImage callback"

patterns-established:
  - "Batch reducer: ADD_IMAGES, SET_QUEUED, SET_PROCESSING, SET_DONE, SET_ERROR, RETRY, REMOVE, CLEAR_ALL"
  - "Concurrency queue: enqueueProcessing(ids, processOne) gates to max 2 via p-limit"
  - "Worker promise bridge: pendingInferencesRef Map<imageId, {resolve, reject}>"
  - "Blob URL revocation in reducer: REMOVE revokes all URLs, RETRY revokes result URLs, CLEAR_ALL revokes everything"

# Metrics
duration: 3min
completed: 2026-02-19
---

# Phase 2 Plan 1: Batch Upload Infrastructure Summary

**react-dropzone multi-file upload with useReducer batch state machine, p-limit(2) concurrency queue, and compositor extension for white-background JPG -- full batch processing data layer**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-19T11:42:28Z
- **Completed:** 2026-02-19T11:45:41Z
- **Tasks:** 2/2
- **Files created:** 1
- **Files modified:** 5

## Accomplishments

- Batch processing pipeline: drop up to 100 images, they queue and process 2 at a time via p-limit, each producing both transparent PNG and white-background JPG results
- useReducer state machine tracking each image through its full lifecycle (idle -> queued -> processing -> done/error) with retry and remove capabilities
- Compositor extended with `background: "transparent" | "white"` parameter -- white path fills canvas with #ffffff, draws masked image, exports as JPEG at 0.95 quality
- DropZone replaced with react-dropzone: multi-file drag-and-drop, ACCEPT object format, maxFiles=100, rejection errors with auto-clear
- Complete Blob URL lifecycle management: URLs revoked on remove, retry, clear, and component unmount

## Task Commits

Each task was committed atomically:

1. **Task 1: Batch types, compositor extension, and concurrency queue** - `72f4cad` (feat)
2. **Task 2: Multi-file DropZone and App.tsx batch refactor** - `dbaebbd` (feat)

## Files Created/Modified

- `src/lib/types.ts` - Extended with ImageItem, BatchState, BatchAction, ImageStatus, BackgroundMode (existing Worker types preserved)
- `src/lib/compositor.ts` - Added `background` parameter; white path creates extra OffscreenCanvas with white fill, exports JPEG
- `src/lib/queue.ts` - NEW: p-limit(2) concurrency gate with enqueueProcessing, getPendingCount, getActiveCount
- `src/components/DropZone.tsx` - REPLACED: react-dropzone useDropzone with ACCEPT object, maxFiles, rejection error display with 5s auto-clear
- `src/components/App.tsx` - REWRITTEN: useReducer batch state, worker promise bridge, queue orchestration, HEIC at drop time, minimal batch list UI
- `package.json` - Added react-dropzone and p-limit dependencies

## Decisions Made

- **react-dropzone v15 over v14.4.x:** npm installed latest (v15.0.0). The breaking change (isDragReject clears after drop) is irrelevant -- we handle rejections via onDropRejected callback, not isDragReject state.
- **Both output formats at processing time:** Generating transparent PNG + white JPG upfront costs ~2x canvas operations per image but gives instant preview toggle. At ~2MB/image for 100 images, ~200MB of Blobs is within browser limits.
- **Pending inference promise map:** Worker messages are matched to React dispatches via a Map<imageId, {resolve, reject}> ref, enabling clean async/await in processOneImage.
- **stateRef pattern:** useRef mirrors useReducer state via useEffect, allowing async callbacks to read current state without dependency array stale closures.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Batch processing data layer complete: drop -> HEIC convert -> queue -> inference -> composite -> done
- Plan 02 (full UI: image grid, before/after, theme toggle, background mode toggle) can build directly on this state machine
- Phase 3 batch download will consume resultUrl/resultWhiteUrl from BatchState
- ResultView component from Phase 1 is no longer imported in App.tsx (single-image UI replaced by batch list) -- may be removed or repurposed in Plan 02

## Self-Check: PASSED

- [x] src/lib/queue.ts exists on disk
- [x] src/lib/types.ts contains ImageStatus
- [x] src/lib/compositor.ts contains background parameter
- [x] src/components/DropZone.tsx contains useDropzone
- [x] src/components/App.tsx contains useReducer
- [x] package.json contains react-dropzone and p-limit
- [x] git log shows 2 commits matching "02-01" (72f4cad, dbaebbd)
- [x] TypeScript compiles cleanly (npx tsc -b zero errors)
- [x] Production build succeeds (npm run build)

---
*Phase: 02-batch-ui*
*Completed: 2026-02-19*
