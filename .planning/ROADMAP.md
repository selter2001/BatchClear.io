# Roadmap: BatchClear.io

## Overview

BatchClear.io ships in three phases that follow the architecture's dependency chain: first prove the AI pipeline works end-to-end for a single image (the riskiest part), then wire it into a full batch workflow with UI, then add batch download and deploy to production. Each phase delivers a verifiable capability -- a working pipeline, a complete processing UI, and a shipped product.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation + AI Pipeline** - Prove end-to-end background removal works for a single image in-browser
- [x] **Phase 2: Batch Upload + Full UI** - Complete batch processing workflow with progress tracking, previews, and polished interface
- [ ] **Phase 3: Batch Download + Deploy** - ZIP download, deployment to GitHub Pages, and production verification

## Phase Details

### Phase 1: Foundation + AI Pipeline
**Goal**: A user can drop a single image and get back a professional-quality background-removed result -- processed entirely in their browser with no server interaction
**Depends on**: Nothing (first phase)
**Requirements**: AI-01, AI-02, AI-03, AI-04, AI-05, INFRA-01, INFRA-03
**Success Criteria** (what must be TRUE):
  1. User can drop an image and receive a background-removed PNG output at full original resolution
  2. First-time visitor sees model download progress (MB downloaded / total) with clear "one-time download" messaging; returning visitor sees model load instantly from cache
  3. UI remains fully responsive during AI processing -- no freezes, no jank (Web Worker isolation verified)
  4. `crossOriginIsolated === true` in browser console when served locally (coi-serviceworker working)
  5. Zero network requests occur during image processing -- all inference is local
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md -- Project scaffold + Web Worker AI pipeline (Vite, React, Tailwind, TypeScript, coi-serviceworker, Worker singleton with RMBG-1.4, model download progress)
- [x] 01-02-PLAN.md -- Canvas compositor + minimal drop UI (full-resolution mask compositing, OffscreenCanvas reuse, basic drop zone, end-to-end single-image flow with human verification)

### Phase 2: Batch Upload + Full UI
**Goal**: Users can drop up to 100 images and watch them process through a polished, responsive interface with per-image progress, before/after previews, and background mode toggle
**Depends on**: Phase 1
**Requirements**: UPLD-01, UPLD-02, UPLD-03, UPLD-04, UPLD-05, UPLD-06, UPLD-07, OUT-01, UI-01, UI-02, UI-03, UI-04, UI-05, UI-06
**Success Criteria** (what must be TRUE):
  1. User can drag-and-drop or click-to-browse up to 100 images (PNG, JPG, WebP); unsupported files are rejected with a clear error message
  2. Each image shows its own progress state (Waiting / Processing / Done / Error); failed images can be retried individually without restarting the batch
  3. User can toggle between transparent (PNG) and white background (JPG) output and see the result update in preview
  4. User can compare before/after for each image, with checkerboard pattern behind transparent areas
  5. Dark/light theme toggle persists across sessions; layout works on desktop, tablet, and mobile
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md -- Batch state infrastructure (react-dropzone multi-file upload, useReducer batch state machine, p-limit concurrency queue, compositor white-background extension, HEIC at drop time)
- [x] 02-02-PLAN.md -- Full UI + theme (ImageGrid, ImageCard with before/after + checkerboard, background toggle, dark/light theme, responsive layout, batch progress indicator, visual polish)

### Phase 3: Batch Download + Deploy
**Goal**: Users can download all processed images as a ZIP, and the app is live on GitHub Pages with production-verified cross-browser compatibility
**Depends on**: Phase 2
**Requirements**: OUT-02, OUT-03, OUT-04, OUT-05, INFRA-02, INFRA-04, INFRA-05
**Success Criteria** (what must be TRUE):
  1. User can download all processed images as a single ZIP file; output filenames preserve originals with `_nobg` suffix
  2. User can download individual processed images one at a time
  3. ZIP generation handles 100 images without browser tab crash or OOM (fflate streaming compression)
  4. App is live on GitHub Pages with `crossOriginIsolated === true` in production; cold-cache model download works on throttled connection
  5. Browser warns user before navigating away when processing is active or undownloaded results exist
**Plans**: TBD

Plans:
- [ ] 03-01: Batch download (individual image download, fflate ZIP generation with streaming compression, filename preservation, Blob URL lifecycle management)
- [ ] 03-02: Deploy + production verification (GitHub Pages deploy script, base URL config, cross-browser testing, navigation warning, README.md)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation + AI Pipeline | 2/2 | Complete | 2026-02-19 |
| 2. Batch Upload + Full UI | 2/2 | Complete | 2026-02-19 |
| 3. Batch Download + Deploy | 0/2 | Not started | - |

---
*Roadmap created: 2026-02-19*
*Last updated: 2026-02-19 -- Phase 2 complete*
