# BatchClear.io

## What This Is

BatchClear.io is a free, fully client-side web application for batch background removal from images. Users can process up to 100 images at once using AI (RMBG-1.4 via Transformers.js) running entirely in their browser — no uploads, no server, no cost. Hosted on GitHub Pages as a static site.

## Core Value

Users can drag-and-drop up to 100 images and get professional-quality background removal — all processed locally in the browser with zero privacy concerns and zero cost.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Batch drag-and-drop upload supporting up to 100 images at once
- [ ] AI-powered background removal using @xenova/transformers with RMBG-1.4 model
- [ ] Web Worker multithreading — AI model runs in a separate thread
- [ ] Concurrency queue — max 2 images processed simultaneously, rest queued
- [ ] Individual progress bars per image (Waiting → Processing AI X% → Done)
- [ ] Ultra-high quality output using Canvas API at full original resolution
- [ ] Background toggle: Transparent (PNG) or White (JPG)
- [ ] Batch download as ZIP via JSZip
- [ ] Dark/Light theme toggle with persistent preference
- [ ] Professional, modern UI with responsive design
- [ ] Fully static deployment on GitHub Pages (zero backend)
- [ ] Images never leave the user's device — 100% client-side processing

### Out of Scope

- Backend or server-side processing — privacy and cost constraint
- User accounts or authentication — unnecessary for the use case
- Image editing features (crop, resize, filters) — this is a background removal tool, not an editor
- Mobile-native app — web-only, responsive design covers mobile browsers
- Paid tiers or monetization — free tool
- Multi-language (i18n) — English only for v1

## Context

- **AI Model**: RMBG-1.4 by BRIA AI, accessible via @xenova/transformers (Transformers.js). Runs ONNX inference in-browser. The model is ~40MB and needs to be downloaded on first use.
- **Performance**: Processing happens in Web Workers to avoid blocking the main UI thread. Queue system ensures browser stability by limiting concurrent processing to 2 images.
- **Quality**: Canvas API composites the AI-generated mask onto the original full-resolution image, avoiding any compression or downscaling artifacts.
- **Hosting**: GitHub Pages serves the static build. Vite's `base` config must be set correctly for the repo name.

## Constraints

- **Tech Stack**: React.js (Vite) + Tailwind CSS — specified by project owner
- **AI Runtime**: @xenova/transformers with RMBG-1.4 — no alternative models or services
- **Hosting**: GitHub Pages — must be fully static, no SSR, no serverless functions
- **Budget**: $0 — no paid services, APIs, or infrastructure
- **Browser Compatibility**: Modern browsers with Web Worker and WebAssembly support
- **File Limit**: Up to 100 images per batch — browser memory constraint

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Client-side only (no backend) | Zero hosting cost, complete privacy, no data leaves device | — Pending |
| RMBG-1.4 via Transformers.js | Best open-source bg removal model available for in-browser inference | — Pending |
| Max 2 concurrent workers | Balance between speed and browser stability/memory | — Pending |
| React + Vite + Tailwind | Modern, fast toolchain with great DX and small bundle | — Pending |
| JSZip for batch download | Client-side ZIP creation, no server needed | — Pending |
| Dark/Light theme toggle | User preference, modern UX expectation | — Pending |

---
*Last updated: 2026-02-19 after initialization*
