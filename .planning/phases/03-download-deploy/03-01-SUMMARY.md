---
phase: 03-download-deploy
plan: 01
subsystem: download, ui
tags: [fflate, zip, streaming, blob-url, beforeunload, navigation-guard, download]

# Dependency graph
requires:
  - phase: 02-01
    provides: "Batch state machine with ImageItem (resultUrl, resultWhiteUrl), BackgroundMode type"
  - phase: 02-02
    provides: "ImageGrid and ImageCard components, BatchProgress, batch progress area layout"
provides:
  - "Streaming ZIP generation via fflate Zip + ZipPassThrough for bounded-memory batch download"
  - "Individual image download from blob URL with _nobg suffix filenames"
  - "Filename deduplication for duplicate originals in ZIP"
  - "Download All (ZIP) button with real-time progress indicator"
  - "Per-image download button on done ImageCards"
  - "beforeunload navigation warning when processing active or results undownloaded"
  - "hasDownloaded tracking with reset on new images"
affects: [03-02-deploy]

# Tech tracking
tech-stack:
  added: ["fflate 0.8.2"]
  patterns: ["streaming ZIP with Zip + ZipPassThrough", "Blob chunk collection for memory-bounded ZIP", "useNavigationWarning custom hook", "Uint8Array<ArrayBuffer> copy for TS5.7 BlobPart compat"]

key-files:
  created:
    - "src/lib/download.ts"
  modified:
    - "src/components/App.tsx"
    - "src/components/ImageCard.tsx"
    - "src/components/ImageGrid.tsx"
    - "package.json"

key-decisions:
  - "Uint8Array copy in ZIP ondata callback to satisfy TS5.7 strict ArrayBuffer vs ArrayBufferLike BlobPart typing"
  - "hasDownloaded resets on new image add and Clear All, sets true only on Download All ZIP completion"

patterns-established:
  - "download.ts: getOutputFilename strips ext, appends _nobg + mode-based extension"
  - "download.ts: deduplicateNames uses Map counter for _2, _3 suffixes"
  - "download.ts: generateBatchZip processes sequentially (not Promise.all) for bounded memory"
  - "download.ts: downloadSingleImage does NOT revoke blob URL (still needed for preview)"
  - "App.tsx: useNavigationWarning(isProcessing || hasUndownloaded) guards tab close"

# Metrics
duration: 3min
completed: 2026-02-19
---

# Phase 3 Plan 1: Batch Download Summary

**Streaming fflate ZIP download with per-image download buttons, filename deduplication, _nobg suffix preservation, and beforeunload navigation guard**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-19T15:29:36Z
- **Completed:** 2026-02-19T15:33:17Z
- **Tasks:** 2/2
- **Files created:** 1
- **Files modified:** 4

## Accomplishments

- Streaming ZIP generation using fflate Zip + ZipPassThrough (no compression for already-compressed PNG/JPEG), processing images sequentially for bounded memory
- Download All (ZIP) button with real-time "Generating ZIP... X/Y" progress, indigo primary styling with download arrow icon
- Per-image download button on each done ImageCard with hover-to-blue transition
- Filename preservation: original name stripped of extension, _nobg suffix added, .png for transparent mode, .jpg for white mode
- Duplicate filename deduplication via Map counter (photo_nobg.png, photo_nobg_2.png, photo_nobg_3.png)
- beforeunload navigation warning when processing is active OR results haven't been downloaded
- hasDownloaded state resets when new images are added or Clear All is clicked

## Task Commits

Each task was committed atomically:

1. **Task 1: Download library + fflate ZIP generation** - `540ff3c` (feat)
2. **Task 2: Wire download UI + navigation warning into App and ImageCard** - `f12519e` (feat)

## Files Created/Modified

- `src/lib/download.ts` - NEW: getOutputFilename, deduplicateNames, generateBatchZip (streaming), triggerDownload, downloadSingleImage
- `src/components/App.tsx` - Added useNavigationWarning hook, hasDownloaded/zipProgress state, handleDownloadAll/handleDownloadSingle handlers, Download All button in progress area
- `src/components/ImageCard.tsx` - Added onDownload prop and download icon button for done images
- `src/components/ImageGrid.tsx` - Added onDownload prop threading to ImageCard
- `package.json` - Added fflate ^0.8.2 dependency

## Decisions Made

- **Uint8Array copy for TS5.7 compat:** fflate's Zip ondata callback provides Uint8Array with ArrayBufferLike buffer type, which TS5.7 doesn't accept as BlobPart. Fixed by copying each chunk to a new Uint8Array<ArrayBuffer> before pushing to the chunks array. This adds minimal overhead (chunks are small ZIP segments) and avoids type assertion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Uint8Array<ArrayBufferLike> incompatibility with BlobPart**
- **Found during:** Task 1 (download.ts creation)
- **Issue:** fflate's Zip callback provides Uint8Array<ArrayBufferLike> but TypeScript 5.7 requires Uint8Array<ArrayBuffer> for BlobPart (SharedArrayBuffer is not assignable to ArrayBuffer)
- **Fix:** Copy each chunk to a new Uint8Array<ArrayBuffer> via `new Uint8Array(chunk.length)` + `.set(chunk)` before collecting
- **Files modified:** src/lib/download.ts
- **Verification:** `npx tsc -b` compiles with zero errors
- **Committed in:** 540ff3c (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor TS compatibility fix, no scope creep. Functionally equivalent to plan.

## Issues Encountered

None beyond the TypeScript type compatibility issue documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Download functionality complete: batch ZIP + individual image download working
- Plan 03-02 (deploy + production verification) can proceed -- the app is fully functional with all three core capabilities (process, preview, download)
- fflate streaming ZIP confirmed working with TypeScript 5.7 strict mode
- beforeunload guard protects against accidental tab close during processing or before download

## Self-Check: PASSED

- [x] src/lib/download.ts exists and exports generateBatchZip, downloadSingleImage, getOutputFilename, deduplicateNames, triggerDownload
- [x] src/components/App.tsx contains beforeunload, generateBatchZip, Download All
- [x] src/components/ImageCard.tsx contains onDownload prop and download button
- [x] src/components/ImageGrid.tsx contains onDownload prop threading
- [x] fflate ^0.8.2 in package.json dependencies
- [x] git log shows 2 commits matching "03-01" (540ff3c, f12519e)
- [x] TypeScript compiles cleanly (npx tsc -b zero errors)
- [x] Production build succeeds (npm run build)

---
*Phase: 03-download-deploy*
*Completed: 2026-02-19*
