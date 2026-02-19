---
phase: 01-foundation
plan: 02
subsystem: ui, compositor
tags: [canvas, offscreencanvas, drag-and-drop, heic, heic-to, blob-url, compositing]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Web Worker inference pipeline with RMBG-1.4, typed message protocol"
provides:
  - "Full-resolution Canvas compositor (mask scaling + alpha compositing + memory cleanup)"
  - "End-to-end single-image background removal flow (drop -> process -> display -> download)"
  - "HEIC/HEIF support for iPhone photos via heic-to/csp"
  - "Model download progress UI with MB counter and one-time messaging"
  - "Result display with checkerboard transparency and PNG download"
affects: [02-batch-ui, 03-download-deploy]

# Tech tracking
tech-stack:
  added: ["heic-to 1.4.2 (CSP variant)"]
  patterns: ["OffscreenCanvas compositing with aggressive memory cleanup", "Blob URL lifecycle management", "Eager model loading via load-model message", "HEIC detection by MIME type + file extension fallback"]

key-files:
  created:
    - "src/lib/compositor.ts"
    - "src/components/DropZone.tsx"
    - "src/components/ModelProgress.tsx"
    - "src/components/ResultView.tsx"
  modified:
    - "src/components/App.tsx"
    - "package.json"

key-decisions:
  - "Used heic-to/csp instead of heic2any — CSP-compatible variant works with cross-origin isolation"
  - "HEIC detection uses both MIME type and file extension (iPhone sometimes reports empty MIME)"
  - "HEIC converted to JPEG at 0.95 quality before AI processing"
  - "Three OffscreenCanvases for compositing with aggressive shrink-to-1x1 cleanup for iOS Safari memory ceiling"

patterns-established:
  - "OffscreenCanvas compositing: mask at model res -> scale to original -> apply alpha -> export PNG -> shrink canvases"
  - "Blob URL lifecycle: createObjectURL on result, revokeObjectURL on reset/new-drop/unmount"
  - "Eager model loading: postMessage load-model immediately on Worker creation"
  - "HEIC pipeline: detect -> convert to JPEG -> process normally"

# Metrics
duration: 12min
completed: 2026-02-19
---

# Phase 1 Plan 2: Canvas Compositor + Drop UI Summary

**Full-resolution Canvas compositor with end-to-end drop-to-download flow, HEIC/HEIF iPhone support, and human-verified background removal in Safari**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-19T10:01:00Z
- **Completed:** 2026-02-19T10:13:00Z
- **Tasks:** 3/3 (2 auto + 1 human-verify checkpoint)
- **Files created:** 4
- **Files modified:** 2

## Accomplishments

- Full-resolution Canvas compositor: takes model-res mask (1024x1024) + original image, produces full-res transparent PNG via 3 OffscreenCanvases with iOS Safari memory cleanup
- Complete end-to-end flow: drop image -> model downloads (first time) -> inference -> compositing -> result with checkerboard transparency -> PNG download
- HEIC/HEIF support for iPhone photos via heic-to/csp (CSP-compatible, works with cross-origin isolation)
- Model download progress bar with MB counter and "one-time only" messaging
- Human-verified in Safari: crossOriginIsolated === true, background removal works, result at original resolution

## Task Commits

Each task was committed atomically:

1. **Task 1: Canvas compositor** - `280fc29` (feat)
2. **Task 2: Drop zone UI + end-to-end wiring** - `7b76663` (feat)
3. **Task 3: HEIC support + human verification** - `aae0779` (feat)

## Files Created/Modified

- `src/lib/compositor.ts` - Full-resolution mask compositing with 3 OffscreenCanvases and memory cleanup
- `src/components/DropZone.tsx` - HTML5 drag-and-drop + browse, validates PNG/JPG/WebP/HEIC
- `src/components/ModelProgress.tsx` - Model download progress bar with MB counter, ready/error states
- `src/components/ResultView.tsx` - Checkerboard transparency preview, download link with _nobg.png suffix
- `src/components/App.tsx` - Full wiring: Worker creation, state management, compositor integration, HEIC conversion, Blob URL lifecycle
- `package.json` - Added heic-to dependency

## Decisions Made

- **heic-to/csp over heic2any:** heic2any failed with cross-origin isolation (uses eval/new Function internally). heic-to provides a CSP-compatible variant that works correctly.
- **HEIC detection by extension + MIME type:** iPhones sometimes report empty or generic MIME types for .heic files, so we check both.
- **HEIC -> JPEG at 0.95 quality:** High quality conversion before AI processing preserves detail without excessive file size.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript type error in compositor ImageData constructor**
- **Found during:** Task 2 verification (tsc -b)
- **Issue:** `Uint8ClampedArray<ArrayBufferLike>` not assignable to `ImageDataArray` — strict TS generics with SharedArrayBuffer possibility
- **Fix:** Added `buffer.slice(0)` to ensure plain ArrayBuffer backing with explicit cast
- **File:** src/lib/compositor.ts
- **Committed in:** 7b76663

**2. [Rule 3 - Blocking] heic2any incompatible with cross-origin isolation**
- **Found during:** Human verification (user reported "Failed to convert HEIC file")
- **Issue:** heic2any internally uses eval/new Function which is blocked by CSP in cross-origin isolated context
- **Fix:** Replaced heic2any with heic-to/csp (CSP-compatible variant)
- **Files modified:** src/components/App.tsx, package.json
- **Committed in:** aae0779

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** heic-to/csp replacement was necessary for HEIC to work. No scope creep.

## Issues Encountered

None beyond deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 1 complete: end-to-end single-image background removal verified in Safari
- crossOriginIsolated === true confirmed
- Model download + caching working
- Full-resolution output confirmed
- HEIC iPhone photos supported
- Ready for Phase 2: batch upload + full UI

## Self-Check: PASSED

- [x] src/lib/compositor.ts exists on disk
- [x] src/components/DropZone.tsx exists on disk
- [x] src/components/ModelProgress.tsx exists on disk
- [x] src/components/ResultView.tsx exists on disk
- [x] git log shows 3 commits matching "01-02"
- [x] Human verification passed (Safari screenshot confirmed)

---
*Phase: 01-foundation*
*Completed: 2026-02-19*
