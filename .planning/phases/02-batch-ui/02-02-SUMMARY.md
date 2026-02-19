---
phase: 02-batch-ui
plan: 02
subsystem: ui, theme, layout
tags: [image-grid, before-after, theme-toggle, background-toggle, responsive, dark-mode, checkerboard, tailwind]

# Dependency graph
requires:
  - phase: 02-01
    provides: "Batch state machine, concurrency queue, compositor with white-bg support, react-dropzone"
provides:
  - "Responsive CSS Grid image layout (auto-fill, 1/2/3+ columns)"
  - "Per-image cards with status badges (Waiting/Processing/Done/Error)"
  - "Before/after slider comparison using CSS clip-path"
  - "Background mode toggle (transparent PNG / white JPG) with instant preview switch"
  - "Dark/light theme toggle with localStorage persistence and FOUC prevention"
  - "Batch progress bar with processed/total counts"
  - "Checkerboard pattern behind transparent preview areas"
  - "Compact/full DropZone modes, Clear All functionality"
affects: [03-download-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns: ["CSS clip-path before/after slider", "sync theme script in head for FOUC prevention", "@custom-variant dark for Tailwind v4", "checkerboard CSS gradient pattern"]

key-files:
  created:
    - "src/lib/theme.ts"
    - "src/components/ThemeToggle.tsx"
    - "src/components/BackgroundToggle.tsx"
    - "src/components/BatchProgress.tsx"
    - "src/components/BeforeAfter.tsx"
    - "src/components/ImageCard.tsx"
    - "src/components/ImageGrid.tsx"
  modified:
    - "index.html"
    - "src/index.css"
    - "src/components/App.tsx"
    - "src/components/DropZone.tsx"
    - "src/components/ModelProgress.tsx"

key-decisions:
  - "CSS clip-path inset() for before/after slider (no canvas, pure CSS)"
  - "Sync script in <head> for theme detection -- prevents FOUC on dark mode"
  - "@custom-variant dark with .dark class selector for Tailwind v4"
  - "filesRef pattern to fix stale stateRef in processOneImage (sync file lookup before React re-renders)"

patterns-established:
  - "Theme: getEffectiveTheme() checks localStorage then prefers-color-scheme"
  - "BeforeAfter: range input 0-100 drives clip-path: inset(0 {100-pos}% 0 0)"
  - "ImageCard: status-driven rendering (idle/queued→thumbnail, processing→pulse, done→BeforeAfter, error→retry)"
  - "Compact DropZone: smaller padding + inline text when images already loaded"

# Metrics
duration: 7min
completed: 2026-02-19
---

# Phase 2 Plan 2: Full UI + Theme Summary

**Responsive image grid, before/after comparison, background toggle, dark/light theme, batch progress -- complete polished interface for batch background removal**

## Performance

- **Duration:** 7 min
- **Tasks:** 3/3 (2 auto + 1 checkpoint)
- **Files created:** 7
- **Files modified:** 5

## Accomplishments

- Responsive CSS Grid layout: auto-fill minmax(280px, 1fr) — 1 column on mobile, 2 on tablet, 3+ on desktop
- Per-image ImageCard with status-dependent rendering: waiting thumbnail, processing pulse overlay, done BeforeAfter slider, error with retry
- Before/after comparison slider using CSS clip-path inset() with vertical divider line and Before/After labels
- Background mode toggle: segmented control switching between transparent (checkerboard) and white JPG preview instantly
- Dark/light theme with sync script in head preventing FOUC, localStorage persistence, sun/moon toggle icon
- Batch progress bar: "X of Y processed" with animated width transition
- Checkerboard CSS pattern for transparent area visualization (theme-aware colors)
- Compact DropZone mode when images loaded, Clear All button, fade-in-up animations
- Bug fix: filesRef pattern replacing stateRef for processOneImage file lookup (stateRef was stale due to async useEffect)

## Task Commits

1. **Task 1: Theme infrastructure, UI components, and responsive grid** - `e6a6207` (feat)
2. **Task 2: Wire UI components into App.tsx with visual polish** - `fe6834d` (feat)
3. **Bug fix: filesRef for processOneImage** - `940ca5a` (fix)

## Deviations from Plan

- **filesRef bug fix:** processOneImage couldn't find files in stateRef because React useEffect updating the ref hadn't fired when p-limit called the function synchronously. Added filesRef (Map id→File) updated synchronously in handleFilesAccepted.

## Issues Encountered

- **Stale stateRef race condition:** enqueueProcessing calls processOneImage synchronously from handleFilesAccepted, but stateRef is updated asynchronously via useEffect after React re-renders. Images were stuck in "Queued" forever. Fixed with direct filesRef map.

## Self-Check: PASSED

- [x] src/components/ImageGrid.tsx contains auto-fill
- [x] src/components/ImageCard.tsx contains ImageItem
- [x] src/components/BeforeAfter.tsx contains clip-path
- [x] src/components/BatchProgress.tsx contains processed
- [x] src/components/BackgroundToggle.tsx contains BackgroundMode
- [x] src/components/ThemeToggle.tsx contains localStorage
- [x] src/lib/theme.ts contains theme
- [x] src/index.css contains @custom-variant dark
- [x] index.html contains localStorage.theme
- [x] TypeScript compiles cleanly
- [x] Human verification: approved

---
*Phase: 02-batch-ui*
*Completed: 2026-02-19*
