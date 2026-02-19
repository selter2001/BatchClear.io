# BatchClear.io

Free, client-side batch background removal powered by AI.

## Features

- Batch drag-and-drop upload (up to 100 images)
- AI-powered background removal (RMBG-1.4 via Transformers.js)
- 100% client-side -- images never leave your device
- Transparent (PNG) or white background (JPG) output
- Before/after comparison slider
- Individual and batch ZIP download
- Dark/light theme
- Responsive design (desktop, tablet, mobile)

## Tech Stack

React 19, Vite 6, Tailwind CSS 4, TypeScript, Transformers.js (RMBG-1.4 ONNX), fflate, Web Workers

## How It Works

Images go through a fully local pipeline that runs entirely in your browser:

1. **Drag & drop** -- Drop images onto the upload zone (supports PNG, JPG, WebP, HEIC)
2. **Web Worker inference** -- A dedicated Web Worker loads the RMBG-1.4 ONNX model via Transformers.js and removes the background from each image
3. **Canvas compositing** -- The resulting alpha mask is applied on an OffscreenCanvas to produce a transparent PNG or a white-background JPG
4. **Download** -- Grab individual results or download everything as a single ZIP file

No server round-trips, no uploads, no waiting on external APIs.

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Production build
npm run build

# Deploy to GitHub Pages
npm run deploy
```

## Privacy

All processing happens locally in your browser. No images are uploaded anywhere. No server, no tracking, no data collection.

## License

MIT
