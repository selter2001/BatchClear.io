# Phase 3: Batch Download + Deploy - Research

**Researched:** 2026-02-19
**Domain:** Client-side ZIP generation (fflate), programmatic file download, GitHub Pages deployment, navigation guards
**Confidence:** HIGH

## Summary

Phase 3 delivers the final two capabilities: batch download (individual + ZIP) and production deployment to GitHub Pages. The download work is the more technically nuanced part -- it requires converting Blob URLs back to raw data, feeding them through fflate's streaming ZIP API with `ZipPassThrough` (since PNG/JPEG are already compressed), and triggering a browser download via a programmatic anchor click. The deployment work is straightforward because the coi-serviceworker is already integrated and Vite's `base` is already set to `/BatchClear.io/`.

The critical technical finding from this research is that **fflate's streaming `Zip` + `ZipPassThrough` API is the correct approach for our use case** -- not `zipSync` (which blocks the main thread and loads all data into memory at once) and not `AsyncZipDeflate` (which wastes CPU compressing already-compressed images). `ZipPassThrough` stores files without compression (equivalent to `level: 0`), which is optimal for PNG and JPEG. The streaming API (`new Zip()` with `ondata` callback) produces chunks incrementally, which we collect into a `Blob` array and construct a final Blob for download. This avoids holding the entire ZIP in memory as a single contiguous Uint8Array.

For 100 images at typical sizes (2-5MB each = 200-500MB total ZIP), the Blob-collection approach stays within Chrome's ~500MB blob storage limit. StreamSaver.js would only be needed for multi-gigabyte ZIPs, which is beyond our 100-image scope.

**Primary recommendation:** Use fflate's streaming `Zip` + `ZipPassThrough` for ZIP generation with chunk-collection into a Blob array. Use `gh-pages` npm package for deploy with a `package.json` script. Add `beforeunload` guard when processing is active or undownloaded results exist.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fflate | ^0.8.2 | ZIP generation | 8kB, built-in TypeScript types, 40x faster than JSZip, streaming API avoids main-thread blocking. Already decided in prior research. |
| gh-pages | ^6.3.0 | GitHub Pages deployment | Standard deploy tool, creates gh-pages branch, `package.json` script integration. Satisfies INFRA-02. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | - | - | No additional libraries needed. `beforeunload` is a native browser API. Individual download uses native `<a>` element with `download` attribute. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fflate `Zip` streaming | fflate `zipSync` | `zipSync` blocks main thread and requires all data in memory as one Uint8Array. Fine for <10 files, not for 100. |
| fflate `ZipPassThrough` | fflate `AsyncZipDeflate` with `level: 0` | `AsyncZipDeflate` has occasional CRC errors when streaming (GitHub issue #192/#194). `ZipPassThrough` is simpler and CRC-safe. |
| gh-pages npm | GitHub Actions workflow | Actions is the modern Vite-recommended approach but doesn't satisfy the `package.json` deploy script requirement (INFRA-02). Can provide both. |
| Blob collection | StreamSaver.js | StreamSaver streams directly to disk (no memory limit), but adds a dependency and complexity. Only needed for multi-GB ZIPs, beyond our 100-image scope. |

**Installation:**
```bash
npm install fflate gh-pages
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/
│   ├── download.ts          # ZIP generation + individual download helpers
│   ├── types.ts              # Extended with download-related types (if needed)
│   └── ...existing files...
├── components/
│   ├── App.tsx               # Add Download All button, beforeunload guard
│   ├── ImageCard.tsx          # Add individual download button per card
│   └── ...existing files...
public/
├── coi-serviceworker.js       # Already in place
```

### Pattern 1: Streaming ZIP with Blob Collection

**What:** Use fflate's `Zip` class to stream chunks into a `Blob` array, then create a single Blob for download.
**When to use:** When generating ZIPs from already-compressed images (PNG/JPEG) in the browser.
**Example:**

```typescript
// Source: fflate README + Wiki (https://github.com/101arrowz/fflate)
import { Zip, ZipPassThrough } from "fflate";

async function generateZip(
  items: Array<{ name: string; blobUrl: string }>,
): Promise<Blob> {
  const chunks: Uint8Array[] = [];

  const zip = new Zip((err, chunk, final) => {
    if (err) throw err;
    chunks.push(chunk);
  });

  for (const item of items) {
    // Fetch the Blob from the Blob URL
    const response = await fetch(item.blobUrl);
    const blob = await response.blob();
    const data = new Uint8Array(await blob.arrayBuffer());

    // ZipPassThrough = no compression (PNG/JPEG are already compressed)
    const entry = new ZipPassThrough(item.name);
    zip.add(entry);
    entry.push(data, true); // true = final chunk for this file
  }

  zip.end();

  return new Blob(chunks, { type: "application/zip" });
}
```

**Key details:**
- `fetch(blobUrl)` retrieves raw data from a Blob URL -- this is the standard way to convert a Blob URL back to usable data
- `ZipPassThrough` stores files without compression (level 0), optimal for PNG/JPEG
- `entry.push(data, true)` -- the `true` signals this is the last chunk for the file
- `zip.end()` must be called after all files are added
- Collecting chunks in an array and constructing `new Blob(chunks)` is more memory-efficient than concatenating Uint8Arrays (avoids copying)

### Pattern 2: Programmatic File Download

**What:** Trigger a browser file download from a Blob or Blob URL using a temporary anchor element.
**When to use:** For both individual image downloads and ZIP downloads.
**Example:**

```typescript
// Source: MDN Web Docs, standard browser pattern
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  // Cleanup: remove element and revoke URL after a small delay
  // (some browsers need the element to be in DOM during click)
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
```

For individual image download (from existing Blob URL):
```typescript
function downloadFromBlobUrl(blobUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Do NOT revoke the URL here -- it's still used for preview display
}
```

### Pattern 3: Filename Preservation with Suffix

**What:** Generate output filenames that preserve the original name with a `_nobg` suffix.
**When to use:** For both individual downloads and ZIP entries.
**Example:**

```typescript
function getOutputFilename(
  originalName: string,
  mode: "transparent" | "white",
): string {
  const ext = mode === "transparent" ? ".png" : ".jpg";
  const baseName = originalName.replace(/\.[^.]+$/, "");
  return `${baseName}_nobg${ext}`;
}
// "photo.jpg" + "transparent" -> "photo_nobg.png"
// "photo.jpg" + "white"       -> "photo_nobg.jpg"
```

### Pattern 4: beforeunload Navigation Guard

**What:** Warn users before they close the tab or navigate away when there's unsaved work.
**When to use:** When processing is active OR when there are processed results that haven't been downloaded.
**Example:**

```typescript
// Source: MDN Web Docs (https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)
useEffect(() => {
  const handler = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    // Legacy support for Chrome/Edge < 119
    e.returnValue = true;
  };

  if (shouldWarn) {
    window.addEventListener("beforeunload", handler);
  }

  return () => {
    window.removeEventListener("beforeunload", handler);
  };
}, [shouldWarn]);
```

**Key details:**
- Modern browsers show a generic dialog ("Changes you made may not be saved"), custom messages are ignored
- Must call `e.preventDefault()` (modern) AND set `e.returnValue = true` (legacy Chrome/Edge)
- Only attach listener when there's actually something to warn about -- attaching unconditionally hurts bfcache on Firefox
- The dialog requires "sticky activation" (user must have interacted with the page before)

### Pattern 5: GitHub Pages Deploy via gh-pages

**What:** Deploy Vite build output to GitHub Pages using the `gh-pages` npm package.
**When to use:** When INFRA-02 requires a deploy script in package.json.
**Example:**

```json
{
  "scripts": {
    "build": "tsc -b && vite build",
    "predeploy": "npm run build",
    "deploy": "gh-pages -d dist --dotfiles"
  }
}
```

**Key details:**
- `--dotfiles` ensures `.nojekyll` and any dotfiles are included
- Need a `.nojekyll` file in `public/` to prevent GitHub Pages from processing with Jekyll (Jekyll ignores files starting with `_`, like `_assets`)
- Vite's `base: "/BatchClear.io/"` is already configured correctly
- coi-serviceworker.js is already in `public/` -- it gets copied to `dist/` at build time
- The relative `src="coi-serviceworker.js"` script tag in `index.html` resolves correctly because the HTML is served from `/BatchClear.io/` and the file is at `/BatchClear.io/coi-serviceworker.js`

### Anti-Patterns to Avoid

- **Loading all images into memory at once for `zipSync`:** With 100 images at ~3MB each, calling `zipSync` would require ~300MB of contiguous memory for the input PLUS the output. Use streaming `Zip` instead.
- **Using `AsyncZipDeflate` with `level: 0` instead of `ZipPassThrough`:** Occasional CRC errors have been reported (fflate #192/#194). `ZipPassThrough` is simpler and more reliable.
- **Compressing PNG/JPEG in ZIP:** These formats are already compressed. Deflate compression on them wastes CPU and actually increases file size slightly. Always use `level: 0` or `ZipPassThrough`.
- **Revoking Blob URLs during ZIP generation:** The result Blob URLs are still needed for UI previews. Only revoke them during CLEAR_ALL or REMOVE actions (already handled in the reducer).
- **Forgetting to call `zip.end()`:** The fflate `Zip` stream won't finalize the ZIP file structure without this call.
- **Concatenating Uint8Arrays with spread operator:** `new Uint8Array([...chunk1, ...chunk2])` converts to JS array first, quadrupling memory in V8. Use `Blob` array collection instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ZIP file format | Custom ZIP writer | fflate `Zip` + `ZipPassThrough` | ZIP format has CRC checksums, file headers, central directory -- many edge cases |
| File compression | Manual deflate | fflate (skip compression for images) | Compression algorithms are hard to implement correctly |
| GitHub Pages deployment | Manual git branch management | `gh-pages` npm package | Handles branch creation, clean commits, force push correctly |
| Navigation warning | Custom modal / prompt | Native `beforeunload` event | Browser-native, works cross-browser, no UI needed |
| File download trigger | Complex `fetch` + `FileSaver.js` | `<a download>` + `URL.createObjectURL` | Native browser pattern, zero dependencies |

**Key insight:** The entire download system is composable from fflate (ZIP) + native browser APIs (Blob, URL.createObjectURL, anchor download). No extra libraries beyond fflate are needed.

## Common Pitfalls

### Pitfall 1: Blob URL Fetch Fails After Revocation

**What goes wrong:** Trying to `fetch()` a Blob URL after `URL.revokeObjectURL()` has been called returns a network error.
**Why it happens:** The reducer's REMOVE and CLEAR_ALL actions revoke URLs immediately.
**How to avoid:** Generate ZIP before clearing images, or fetch all Blob data into memory first when download is triggered.
**Warning signs:** "Failed to fetch" errors during ZIP generation.

### Pitfall 2: ZIP Generation Blocks UI

**What goes wrong:** Main thread freezes during ZIP creation for 100 images.
**Why it happens:** Even though `ZipPassThrough` doesn't compress, `fetch(blobUrl).arrayBuffer()` for 100 large images is I/O intensive.
**How to avoid:** Process files sequentially (one at a time) rather than `Promise.all()` for the fetch+push loop. This keeps memory bounded. Optionally show a progress indicator during ZIP generation.
**Warning signs:** UI jank or "page unresponsive" warnings.

### Pitfall 3: Memory Spike During ZIP of 100 Large Images

**What goes wrong:** Browser tab crashes with OOM when zipping 100 high-resolution photos.
**Why it happens:** Each `arrayBuffer()` call loads the full image into memory. With 100x5MB images, this is 500MB of ArrayBuffers plus the ZIP output chunks.
**How to avoid:** Process sequentially (fetch one, push to ZIP, let GC reclaim). The Blob array collection pattern (collecting `Uint8Array` chunks from `ondata`) avoids holding a single large buffer. The final `new Blob(chunks)` lets the browser manage memory more efficiently than manual concatenation.
**Warning signs:** Memory profiler shows linear growth without plateaus.

### Pitfall 4: coi-serviceworker.js Path in Production

**What goes wrong:** `crossOriginIsolated` is `false` in production, breaking WASM multithreading.
**Why it happens:** The script tag path doesn't resolve to the correct file on GitHub Pages.
**How to avoid:** The current setup uses `src="coi-serviceworker.js"` (relative path), which resolves correctly when `index.html` is served from `/BatchClear.io/`. Verify by checking `self.crossOriginIsolated` in the browser console after deploy.
**Warning signs:** Model inference is 3.4x slower in production than in dev.

### Pitfall 5: GitHub Pages Jekyll Processing

**What goes wrong:** Assets in `dist/_` prefixed directories are not served.
**Why it happens:** GitHub Pages runs Jekyll by default, which ignores `_` prefixed paths.
**How to avoid:** Add an empty `.nojekyll` file to the `public/` directory so it's copied to `dist/` during build.
**Warning signs:** 404 errors for CSS or JS assets in production.

### Pitfall 6: Duplicate Filenames in ZIP

**What goes wrong:** Users upload multiple files with the same name from different folders.
**Why it happens:** The app stores the original `file.name`, which may not be unique.
**How to avoid:** When generating ZIP entries, detect duplicate output names and append a numeric suffix: `photo_nobg.png`, `photo_nobg_2.png`, etc.
**Warning signs:** ZIP file has fewer files than expected (silently overwritten).

### Pitfall 7: beforeunload Not Firing

**What goes wrong:** User closes tab without getting the warning dialog.
**Why it happens:** The `beforeunload` dialog requires "sticky activation" -- the user must have interacted with the page (click, keypress, etc.) before the browser will show it. Also unreliable on mobile.
**How to avoid:** This is a browser limitation, not a bug. Users who interact with the app (drag-drop, click buttons) will have sticky activation. No workaround needed for mobile.
**Warning signs:** Testing with immediate tab close (no interaction) shows no dialog -- this is expected behavior.

## Code Examples

Verified patterns from official sources:

### Complete ZIP Generation for Batch Download

```typescript
// Source: fflate README + Wiki, adapted for our architecture
import { Zip, ZipPassThrough } from "fflate";
import type { ImageItem, BackgroundMode } from "./types";

function getOutputFilename(name: string, mode: BackgroundMode): string {
  const ext = mode === "transparent" ? ".png" : ".jpg";
  return name.replace(/\.[^.]+$/, "") + "_nobg" + ext;
}

function deduplicateNames(names: string[]): string[] {
  const counts = new Map<string, number>();
  return names.map((name) => {
    const count = counts.get(name) ?? 0;
    counts.set(name, count + 1);
    if (count === 0) return name;
    const ext = name.match(/\.[^.]+$/)?.[0] ?? "";
    const base = name.slice(0, name.length - ext.length);
    return `${base}_${count + 1}${ext}`;
  });
}

export async function generateBatchZip(
  images: ImageItem[],
  mode: BackgroundMode,
  onProgress?: (current: number, total: number) => void,
): Promise<Blob> {
  const doneImages = images.filter((img) => img.status === "done");
  const blobUrls = doneImages.map((img) =>
    mode === "transparent" ? img.resultUrl! : img.resultWhiteUrl!,
  );
  const rawNames = doneImages.map((img) => getOutputFilename(img.name, mode));
  const names = deduplicateNames(rawNames);

  const chunks: Uint8Array[] = [];
  const zip = new Zip((err, chunk, _final) => {
    if (err) throw err;
    chunks.push(chunk);
  });

  for (let i = 0; i < doneImages.length; i++) {
    onProgress?.(i + 1, doneImages.length);

    const response = await fetch(blobUrls[i]!);
    const arrayBuf = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuf);

    const entry = new ZipPassThrough(names[i]!);
    zip.add(entry);
    entry.push(data, true);
  }

  zip.end();
  return new Blob(chunks, { type: "application/zip" });
}
```

### Individual Image Download

```typescript
export function downloadSingleImage(
  blobUrl: string,
  originalName: string,
  mode: BackgroundMode,
): void {
  const filename = getOutputFilename(originalName, mode);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
```

### beforeunload Hook

```typescript
// Source: MDN Web Docs beforeunload event
import { useEffect } from "react";

export function useNavigationWarning(shouldWarn: boolean): void {
  useEffect(() => {
    if (!shouldWarn) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = true; // Legacy Chrome/Edge < 119
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [shouldWarn]);
}

// Usage in App.tsx:
// const isProcessing = images.some(i => i.status === "processing" || i.status === "queued");
// const hasUndownloaded = images.some(i => i.status === "done");
// useNavigationWarning(isProcessing || hasUndownloaded);
```

### Deploy Configuration

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "predeploy": "npm run build",
    "deploy": "gh-pages -d dist --dotfiles"
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSZip `generateAsync` | fflate `Zip` streaming | 2020+ | 40x faster, 8kB vs 100kB+, streaming reduces memory |
| JSZip `streamFiles: true` | fflate `ZipPassThrough` | 2020+ | Native pass-through for pre-compressed files, no unnecessary deflate |
| Custom deploy scripts | `gh-pages` npm package | Stable since 2015 | Single command deployment, handles branch creation/cleanup |
| `onbeforeunload` return string | `event.preventDefault()` | Chrome 119 (2023) | Custom strings ignored by all modern browsers; `preventDefault()` is the standard |
| FileSaver.js for downloads | Native `<a download>` + `Blob` | 2018+ | Zero-dependency, works in all modern browsers |

**Deprecated/outdated:**
- JSZip: Still works but significantly slower and larger than fflate. Prior research already decided on fflate.
- `event.returnValue = "custom string"`: Custom strings no longer displayed. Only the generic browser dialog is shown.
- FileSaver.js: Unnecessary in modern browsers. The `<a download>` pattern handles all our needs.

## Open Questions

1. **"Download All" tracking state**
   - What we know: The requirement says "browser warns when undownloaded results exist" (INFRA-04). We need to track whether the user has downloaded their results.
   - What's unclear: Should the warning disappear after "Download All ZIP" is clicked? Or after each individual image is downloaded? Or only when all images are individually downloaded?
   - Recommendation: Track a `hasDownloaded` boolean flag that becomes `true` when "Download All ZIP" is clicked OR when ALL individual images have been downloaded. The beforeunload warning fires when `hasDownloaded === false` AND `doneCount > 0`.

2. **GitHub Actions vs gh-pages for long-term**
   - What we know: Vite's official docs recommend GitHub Actions workflow. The requirement INFRA-02 asks for a deploy script in package.json.
   - What's unclear: Whether the user wants GitHub Actions CI/CD or just a local deploy command.
   - Recommendation: Implement `gh-pages` npm package (satisfies INFRA-02 directly). Optionally also provide a `.github/workflows/deploy.yml` for automated deploys on push to main.

3. **ZIP progress indication**
   - What we know: ZIP generation for 100 images could take several seconds (mostly I/O from Blob URL fetch).
   - What's unclear: Should there be a dedicated progress UI during ZIP generation?
   - Recommendation: Show a simple progress state ("Generating ZIP... 23/100") using the `onProgress` callback in the ZIP generation function. This can be displayed in the download button itself or as a small overlay.

## Sources

### Primary (HIGH confidence)
- [fflate GitHub README](https://github.com/101arrowz/fflate) -- ZIP streaming API, `Zip`, `ZipPassThrough`, `ZipDeflate` class usage, performance characteristics
- [fflate Wiki: Modern Guide](https://github.com/101arrowz/fflate/wiki/Guide:-Modern-(Buildless)) -- Complete streaming ZIP + download example with `ZipPassThrough` for pre-compressed files
- [fflate Wiki: FAQ](https://github.com/101arrowz/fflate/wiki/FAQ) -- Browser compatibility, Uint8Array requirement, streaming for large files
- [MDN: Window beforeunload event](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event) -- `preventDefault()` + `returnValue` pattern, sticky activation requirement, mobile limitations
- [Vite: Deploying a Static Site](https://vite.dev/guide/static-deploy) -- GitHub Pages base config, GitHub Actions workflow YAML

### Secondary (MEDIUM confidence)
- [fflate GitHub Discussion #85](https://github.com/101arrowz/fflate/discussions/85) -- Large image file ZIP creation patterns, `level: 0` for pre-compressed formats
- [fflate GitHub Discussion #94](https://github.com/101arrowz/fflate/discussions/94) -- Blob storage limits (~500MB Chrome), StreamSaver.js for larger files
- [fflate GitHub Discussion #192](https://github.com/101arrowz/fflate/discussions/192) -- CRC errors with `AsyncZipDeflate` streaming; `ZipPassThrough` recommended for reliability
- [gh-pages npm](https://www.npmjs.com/package/gh-pages) -- v6.3.0, `--dotfiles` flag, deploy script pattern
- [coi-serviceworker GitHub](https://github.com/gzuidhof/coi-serviceworker) -- Production usage, script placement, first-load reload behavior

### Tertiary (LOW confidence)
- [Chromium Issue #375297](https://bugs.chromium.org/p/chromium/issues/detail?id=375297) -- ~500MB blob storage limit in Chrome (issue from 2014, likely increased since but conservative estimate is safe)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- fflate v0.8.2 API verified against README, Wiki, and GitHub discussions. gh-pages v6.3.0 verified on npm.
- Architecture: HIGH -- Streaming ZIP pattern verified in fflate Wiki with complete code examples. Download pattern is a well-documented browser standard.
- Pitfalls: HIGH -- CRC issue with AsyncZipDeflate confirmed in fflate issue tracker. Blob URL lifecycle verified against existing codebase. coi-serviceworker path verified against existing `index.html` + `vite.config.ts`.
- Deploy: MEDIUM -- GitHub Pages deploy verified against Vite official docs. The `base: "/BatchClear.io/"` is already configured. `.nojekyll` needs to be added but pattern is well-documented.

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (stable libraries, no fast-moving APIs)
