# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** Users can drag-and-drop up to 100 images and get professional-quality background removal -- all processed locally in the browser with zero privacy concerns and zero cost.
**Current focus:** Phase 3 in progress -- batch download complete, deploy next

## Current Position

Phase: 3 of 3 (Batch Download + Deploy)
Plan: 1 of 2 in current phase
Status: In progress
Last activity: 2026-02-19 -- Completed 03-01-PLAN.md (Batch Download)

Progress: [████████░░] 83% (5/6 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 6min
- Total execution time: 29min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 2/2 | 16min | 8min |
| 02-batch-ui | 2/2 | 10min | 5min |
| 03-download-deploy | 1/2 | 3min | 3min |

**Recent Trend:**
- Last 5 plans: 01-02 (12min), 02-01 (3min), 02-02 (7min), 03-01 (3min)
- Trend: accelerating

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 3 phases derived from architecture dependency chain (pipeline -> batch UI -> download + deploy)
- [Research]: Use @huggingface/transformers v3.8.x (NOT @xenova/transformers); RMBG-1.4 q8 ONNX only browser-compatible model
- [Research]: fflate replaces JSZip for ZIP generation (40x faster, async, no main-thread blocking)
- [Research]: coi-serviceworker required from day one for WASM multithreading on GitHub Pages
- [01-01]: Manual scaffold (no npm create vite) for full config control
- [01-01]: Record<string, unknown> cast for HF progress callback to handle discriminated union safely
- [01-01]: any-typed Segmenter wrapper to avoid TS2590 pipeline union explosion
- [01-02]: heic-to/csp for HEIC conversion (heic2any incompatible with cross-origin isolation)
- [01-02]: HEIC detection uses MIME type + file extension fallback (iPhone reports empty MIME)
- [01-02]: Three OffscreenCanvases with shrink-to-1x1 cleanup for iOS Safari memory ceiling
- [02-01]: react-dropzone v15 over v14.4.x -- isDragReject behavior change irrelevant for our use case
- [02-01]: Both transparent PNG + white JPG generated at processing time for instant preview toggle
- [02-01]: Pending inference promise map for typed async worker communication
- [02-02]: CSS clip-path inset() for before/after slider (no canvas, pure CSS)
- [02-02]: Sync script in head for theme detection -- prevents FOUC on dark mode
- [02-02]: filesRef pattern replacing stateRef for processOneImage (stateRef stale due to async useEffect)
- [03-01]: Uint8Array copy in ZIP ondata callback for TS5.7 strict ArrayBuffer vs ArrayBufferLike BlobPart compat
- [03-01]: hasDownloaded resets on new image add and Clear All, sets true only on Download All ZIP completion

### Pending Todos

None.

### Blockers/Concerns

- [RESOLVED]: fflate streaming ZIP API confirmed -- Zip + ZipPassThrough with ondata chunk collection works correctly with TS5.7.
- [RESOLVED]: Safari EXIF orientation -- no issues observed during Phase 2 testing.
- [RESOLVED]: `background-removal` pipeline output format validated -- returns RawImage with RGBA, alpha=0 for background, at model resolution (1024x1024). Compositor handles scaling to original dimensions.

## Session Continuity

Last session: 2026-02-19
Stopped at: Phase 3 plan 1 complete, ready for plan 2 (deploy)
Resume file: .planning/phases/03-download-deploy/03-02-PLAN.md
