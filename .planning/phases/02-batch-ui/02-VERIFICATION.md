---
phase: 02-batch-ui
verified: 2026-02-19T12:13:18Z
status: human_needed
score: 12/12 must-haves verified
re_verification: false
human_verification:
  - test: "Drop 5-10 PNG/JPG images — watch them process through the grid"
    expected: "Images appear in responsive grid; max 2 show 'Processing' simultaneously; others show 'Queued'; all eventually reach 'Done'"
    why_human: "Concurrency gating (p-limit(2)) and status badge transitions require live browser to observe"
  - test: "Drag the before/after slider on a processed image"
    expected: "Smooth left-right comparison between original and background-removed result; divider line moves fluidly"
    why_human: "CSS clip-path slider feel and visual quality cannot be verified statically"
  - test: "Toggle between Transparent and White background mode"
    expected: "All done image previews instantly switch between checkerboard (transparent PNG) and solid white (white JPG)"
    why_human: "Instant preview switch requires live state update and rendered output to confirm"
  - test: "Toggle dark/light theme, then refresh the page"
    expected: "Theme persists without a white/light flash on page load (FOUC prevention)"
    why_human: "FOUC can only be observed in a live browser during page load"
  - test: "Resize browser window from narrow to wide"
    expected: "Grid adapts: 1 column on mobile (<640px), 2 on tablet, 3+ on desktop — auto-fill minmax(280px,1fr)"
    why_human: "Responsive layout requires visual inspection across viewport widths"
  - test: "Drop a .txt or .pdf file"
    expected: "Error message appears below drop zone listing the rejected file and reason; clears after ~5 seconds"
    why_human: "Error message text and auto-clear timing require live interaction to confirm"
  - test: "Drop a HEIC/HEIF file (or simulate with renamed file)"
    expected: "File accepted and processed without error; appears in grid as a processed image"
    why_human: "HEIC conversion pipeline requires actual HEIC file or device with HEIC support to test end-to-end"
---

# Phase 02: Batch UI Verification Report

**Phase Goal:** Users can drop up to 100 images and watch them process through a polished, responsive interface with per-image progress, before/after previews, and background mode toggle
**Verified:** 2026-02-19T12:13:18Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can drag-and-drop or click-to-browse up to 100 images; unsupported files rejected | VERIFIED | DropZone.tsx uses useDropzone with ACCEPT object (PNG/JPG/WebP/HEIC/HEIF), maxFiles=100-imageCount, onDropRejected shows errors with 5s auto-clear |
| 2 | Each image shows its own progress state (Waiting/Queued/Processing/Done/Error); failed can retry individually | VERIFIED | batchReducer in App.tsx tracks full lifecycle; ImageCard renders StatusBadge per status; RETRY action dispatches + re-enqueues via enqueueProcessing |
| 3 | User can toggle between transparent (PNG) and white (JPG) output and see result update in preview | VERIFIED | BackgroundToggle dispatches SET_BACKGROUND_MODE; ImageCard selects resultUrl vs resultWhiteUrl based on backgroundMode; both Blobs generated at processing time |
| 4 | User can compare before/after with checkerboard pattern behind transparent areas | VERIFIED | BeforeAfter.tsx: clip-path inset() slider, showCheckerboard prop drives .checkerboard CSS class; checkerboard defined in index.css with CSS gradient pattern |
| 5 | Dark/light theme toggle persists across sessions; layout works on desktop, tablet, mobile | VERIFIED | index.html sync script prevents FOUC; theme.ts uses localStorage; ThemeToggle calls toggleTheme(); ImageGrid uses grid-cols-[repeat(auto-fill,minmax(280px,1fr))] |

**Score:** 5/5 truths verified (all automated checks pass)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/types.ts` | ImageItem, BatchState, BatchAction, ImageStatus, BackgroundMode | VERIFIED | 81 lines; all 5 types exported; Worker types preserved |
| `src/lib/queue.ts` | p-limit(2) concurrency gate | VERIFIED | 38 lines; pLimit(2) imported; enqueueProcessing exported and wired in App.tsx |
| `src/lib/compositor.ts` | Extended with white background support | VERIFIED | 146 lines; `background: "transparent" | "white"` param; white path fills #ffffff + exports JPEG 0.95 |
| `src/components/DropZone.tsx` | react-dropzone multi-file with validation | VERIFIED | 171 lines; useDropzone with ACCEPT object; maxFiles dynamic; compact mode; rejection errors |
| `src/components/App.tsx` | useReducer batch state, worker integration, queue orchestration | VERIFIED | 546 lines; batchReducer with all 8 actions; pendingInferencesRef bridge; filesRef pattern; HEIC conversion at drop time |
| `src/components/ImageGrid.tsx` | Responsive CSS Grid | VERIFIED | 32 lines; auto-fill minmax(280px,1fr); maps ImageCard per image; null when empty |
| `src/components/ImageCard.tsx` | Per-image card with status, preview, actions | VERIFIED | 158 lines; status-driven rendering; StatusBadge sub-component; BeforeAfter when done; retry/remove buttons |
| `src/components/BeforeAfter.tsx` | Before/after slider via CSS clip-path | VERIFIED | 92 lines; clip-path: inset(); range input overlay; divider line; Before/After labels; checkerboard support |
| `src/components/BatchProgress.tsx` | Overall batch progress bar with counts | VERIFIED | 43 lines; "X of Y processed" text; animated progress bar; error count |
| `src/components/BackgroundToggle.tsx` | Transparent/white toggle | VERIFIED | 55 lines; BackgroundMode prop; segmented control; dispatches mode changes |
| `src/components/ThemeToggle.tsx` | Dark/light toggle with localStorage | VERIFIED | 52 lines; getEffectiveTheme for initial state; toggleTheme() on click; sun/moon SVG icons |
| `src/lib/theme.ts` | Theme utility functions | VERIFIED | 27 lines; getStoredTheme, getEffectiveTheme, applyTheme, toggleTheme all exported |
| `src/index.css` | Tailwind dark mode @custom-variant + checkerboard CSS | VERIFIED | @custom-variant dark present; .checkerboard CSS gradient pattern; fadeInUp animation |
| `index.html` | Sync theme script preventing FOUC | VERIFIED | Sync script in <head> BEFORE coi-serviceworker; checks localStorage.theme and prefers-color-scheme |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `DropZone.tsx` | `App.tsx` | onFilesAccepted callback dispatches ADD_IMAGES | WIRED | handleFilesAccepted imported as prop; dispatches ADD_IMAGES then SET_QUEUED then enqueueProcessing |
| `App.tsx` | `src/lib/queue.ts` | enqueueProcessing called after ADD_IMAGES | WIRED | import on line 14; called on lines 394 and 412 (retry) |
| `App.tsx` | `src/workers/inference.worker.ts` | postMessage with imageId | WIRED | workerRef.current.postMessage({ type: "process", imageId: id, imageData: file }) on line 329 |
| `App.tsx` | `src/lib/compositor.ts` | compositeFullResolution called on inference-complete | WIRED | lines 336-348; both "transparent" and "white" called; Blob URLs created and dispatched via SET_DONE |
| `App.tsx` | `ImageGrid.tsx` | passes images array and handlers | WIRED | imported line 20; rendered line 531 with state.images, backgroundMode, onRetry, onRemove |
| `ImageGrid.tsx` | `ImageCard.tsx` | maps over images, renders ImageCard per image | WIRED | imported line 2; rendered line 22 inside map |
| `ImageCard.tsx` | `BeforeAfter.tsx` | renders BeforeAfter when status=done | WIRED | imported line 2; rendered line 27 conditionally when status=done AND afterUrl present |
| `BackgroundToggle.tsx` | `App.tsx` | dispatches SET_BACKGROUND_MODE | WIRED | App.tsx line 466: dispatch({ type: "SET_BACKGROUND_MODE", mode }) passed as onChange prop |
| `ThemeToggle.tsx` | `index.html` | reads/writes localStorage.theme, toggles .dark on html | WIRED | applyTheme() in theme.ts: classList.toggle("dark") + localStorage.setItem; sync script in index.html reads same key |

### Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| SC-1: Drag-and-drop / click-to-browse up to 100 images; unsupported files rejected | SATISFIED | react-dropzone with ACCEPT object; maxFiles dynamic; rejection errors displayed |
| SC-2: Per-image progress state; failed images retried individually | SATISFIED | batchReducer lifecycle; RETRY action; retry button in ImageCard; re-enqueues via queue |
| SC-3: Toggle transparent/white background, see preview update | SATISFIED | BackgroundToggle → SET_BACKGROUND_MODE; ImageCard selects correct URL; both results pre-generated |
| SC-4: Before/after comparison with checkerboard behind transparent areas | SATISFIED | BeforeAfter clip-path slider; showCheckerboard prop; .checkerboard CSS class in index.css |
| SC-5: Dark/light theme persists; responsive layout | SATISFIED | localStorage persistence; FOUC prevention script; auto-fill minmax(280px,1fr) grid |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/components/ImageGrid.tsx` | 17 | `return null` | Info | Intentional guard when images array empty — correct behavior |
| `src/components/BatchProgress.tsx` | 14 | `return null` | Info | Intentional guard when total=0 — correct behavior |
| `src/components/ModelProgress.tsx` | 9 | `return null` | Info | Intentional guard for idle state — correct behavior |

No blocker anti-patterns found. All `return null` instances are intentional conditional guards, not stubs.

### Human Verification Required

#### 1. Batch Processing Flow

**Test:** Drop 5-10 PNG/JPG images into the drop zone
**Expected:** Images appear in responsive grid; max 2 show "Processing" simultaneously; others show "Queued"; all eventually reach "Done" with before/after slider
**Why human:** p-limit(2) concurrency enforcement and real-time status badge transitions require live browser to observe

#### 2. Before/After Slider

**Test:** On a processed image (status=done), drag the comparison slider left and right
**Expected:** Smooth before/after comparison; divider line follows cursor; Before/After labels visible; checkerboard visible behind transparent areas
**Why human:** CSS clip-path slider feel and visual quality cannot be verified statically

#### 3. Background Mode Toggle

**Test:** With at least one done image, click "Transparent" and "White" buttons in the header toggle
**Expected:** All done image previews instantly switch between checkerboard (transparent PNG) and white background (white JPG)
**Why human:** Requires live state update and visual confirmation that the correct Blob URL is rendered

#### 4. Theme Persistence / FOUC Prevention

**Test:** Enable dark mode, refresh the page
**Expected:** Page loads in dark mode immediately — no white flash before React hydrates
**Why human:** FOUC is only observable during page load in a live browser

#### 5. Responsive Layout

**Test:** Resize browser window from ~320px to 1440px
**Expected:** Grid adapts from 1 column (narrow) to 2 columns (tablet) to 3+ columns (desktop)
**Why human:** CSS Grid auto-fill behavior must be visually confirmed across viewport widths

#### 6. File Rejection Messages

**Test:** Drop a .txt file and a .pdf file
**Expected:** Error message appears below the drop zone with filename and reason; message clears after ~5 seconds
**Why human:** Error display timing and message clarity require live interaction to confirm

#### 7. HEIC File Support

**Test:** Drop a HEIC or HEIF file (iPhone photo)
**Expected:** File accepted, converted to JPEG at drop time, processed normally, appears in grid
**Why human:** HEIC conversion pipeline requires an actual HEIC file from an Apple device

### Gaps Summary

No automated gaps found. All 12 artifacts verified at all three levels (existence, substantive, wired). All key links confirmed with import + usage. All 5 phase success criteria have supporting code in place.

The only outstanding items are visual/behavioral checks that require a live browser to confirm, specifically: concurrency enforcement feel, before/after slider smoothness, background toggle instant preview update, FOUC absence, responsive grid visual layout, rejection message display, and HEIC file processing.

---

_Verified: 2026-02-19T12:13:18Z_
_Verifier: Claude (gsd-verifier)_
