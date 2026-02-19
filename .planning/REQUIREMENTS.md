# Requirements: BatchClear.io

**Defined:** 2026-02-19
**Core Value:** Users can drag-and-drop up to 100 images and get professional-quality background removal — all processed locally in the browser with zero privacy concerns and zero cost.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### AI Engine

- [ ] **AI-01**: AI model (RMBG-1.4 via @huggingface/transformers) removes background from uploaded images with professional quality
- [ ] **AI-02**: Model download shows progress bar with MB downloaded, total size, and "one-time download" messaging
- [ ] **AI-03**: AI inference runs in a Web Worker thread — UI never freezes during processing
- [ ] **AI-04**: coi-serviceworker enables WASM multithreading on GitHub Pages for optimal inference speed
- [ ] **AI-05**: Full-resolution output via Canvas API — mask composited onto original image at full resolution without compression

### Upload & Processing

- [ ] **UPLD-01**: User can drag-and-drop up to 100 image files (PNG, JPG, WebP) at once
- [ ] **UPLD-02**: User can click to browse and select files via file picker
- [ ] **UPLD-03**: Concurrency queue processes max 2 images simultaneously — remaining images wait in queue
- [ ] **UPLD-04**: Each image displays individual progress indicator: Waiting → Processing AI X% → Done
- [ ] **UPLD-05**: Failed images are marked as errors and skipped — batch processing continues for remaining images
- [ ] **UPLD-06**: User can retry failed individual images without restarting the entire batch
- [ ] **UPLD-07**: Unsupported file types are rejected with clear error message

### Output & Download

- [ ] **OUT-01**: User can toggle between transparent background (PNG) and white background (JPG) output
- [ ] **OUT-02**: User can download all processed images as a single ZIP file
- [ ] **OUT-03**: User can download individual processed images one at a time
- [ ] **OUT-04**: ZIP generation uses streaming compression (fflate) to handle 100 images without memory issues
- [ ] **OUT-05**: Output files preserve original filename with suffix (e.g., photo_nobg.png)

### UI & Theme

- [ ] **UI-01**: Dark/Light theme toggle with preference persisted in localStorage
- [ ] **UI-02**: Before/after comparison preview for each processed image
- [ ] **UI-03**: Responsive layout works on desktop, tablet, and mobile browsers
- [ ] **UI-04**: Checkerboard pattern displayed behind transparent areas in preview
- [ ] **UI-05**: Professional, modern visual design with smooth animations and transitions
- [ ] **UI-06**: Overall batch progress indicator (e.g., "23 of 100 processed")

### Infrastructure

- [ ] **INFRA-01**: Fully static deployment on GitHub Pages with correct Vite base config
- [ ] **INFRA-02**: Deploy script in package.json for GitHub Pages deployment
- [ ] **INFRA-03**: Images never leave user's device — zero network requests for processing
- [ ] **INFRA-04**: Browser navigation warning when processing is active or undownloaded results exist
- [ ] **INFRA-05**: Professional README.md with features, screenshots placeholder, usage instructions, and tech stack

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Output

- **OUT-V2-01**: Custom background color picker (any color, not just white)
- **OUT-V2-02**: WebP output format option for smaller file sizes
- **OUT-V2-03**: Smart file naming with batch prefix/suffix configuration

### Advanced Features

- **ADV-V2-01**: Keyboard shortcuts for common actions (download, clear, toggle theme)
- **ADV-V2-02**: HEIC/HEIF input support for iPhone photos
- **ADV-V2-03**: WebGPU acceleration when browser supports it (MODNet alternative)
- **ADV-V2-04**: PWA offline mode with service worker caching

### UX Enhancements

- **UX-V2-01**: Image grid virtualization for smooth scrolling with 100+ thumbnails
- **UX-V2-02**: Select/deselect individual images for batch ZIP download
- **UX-V2-03**: Queue visualization showing processing order

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Server-side processing | Core constraint: zero backend, zero cost, full privacy |
| User accounts / authentication | Unnecessary for stateless tool |
| Manual brush refinement / editing | This is a removal tool, not an image editor |
| AI background replacement | Out of scope; tool focuses on removal only |
| Video background removal | Different domain, massive complexity increase |
| API / developer integration | No backend to host an API |
| Multi-language (i18n) | English only for v1 |
| Image cropping / resizing / filters | Not an image editor |
| Payment / monetization | Free tool by design |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AI-01 | — | Pending |
| AI-02 | — | Pending |
| AI-03 | — | Pending |
| AI-04 | — | Pending |
| AI-05 | — | Pending |
| UPLD-01 | — | Pending |
| UPLD-02 | — | Pending |
| UPLD-03 | — | Pending |
| UPLD-04 | — | Pending |
| UPLD-05 | — | Pending |
| UPLD-06 | — | Pending |
| UPLD-07 | — | Pending |
| OUT-01 | — | Pending |
| OUT-02 | — | Pending |
| OUT-03 | — | Pending |
| OUT-04 | — | Pending |
| OUT-05 | — | Pending |
| UI-01 | — | Pending |
| UI-02 | — | Pending |
| UI-03 | — | Pending |
| UI-04 | — | Pending |
| UI-05 | — | Pending |
| UI-06 | — | Pending |
| INFRA-01 | — | Pending |
| INFRA-02 | — | Pending |
| INFRA-03 | — | Pending |
| INFRA-04 | — | Pending |
| INFRA-05 | — | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 0
- Unmapped: 28 ⚠️

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-19 after initial definition*
