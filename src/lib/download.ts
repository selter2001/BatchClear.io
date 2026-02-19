import { Zip, ZipPassThrough } from "fflate";
import type { ImageItem, BackgroundMode } from "./types";

// ---------------------------------------------------------------------------
// Filename helpers
// ---------------------------------------------------------------------------

/**
 * Generate output filename with _nobg suffix and appropriate extension.
 * transparent -> .png, white -> .jpg
 */
export function getOutputFilename(
  originalName: string,
  mode: BackgroundMode,
): string {
  const ext = mode === "transparent" ? ".png" : ".jpg";
  const baseName = originalName.replace(/\.[^.]+$/, "");
  return `${baseName}_nobg${ext}`;
}

/**
 * Deduplicate an array of filenames by appending _2, _3, etc. to duplicates.
 * First occurrence keeps original name.
 */
export function deduplicateNames(names: string[]): string[] {
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

// ---------------------------------------------------------------------------
// ZIP generation
// ---------------------------------------------------------------------------

/**
 * Generate a ZIP blob from all done images using fflate streaming.
 * Processes images sequentially to keep memory bounded.
 * Uses ZipPassThrough (no compression) since PNG/JPEG are already compressed.
 */
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

  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const zip = new Zip((err, chunk, _final) => {
    if (err) throw err;
    // Copy chunk to a new buffer owned by ArrayBuffer (not SharedArrayBuffer)
    // to satisfy TypeScript's strict BlobPart typing.
    const copy = new Uint8Array(chunk.length) as Uint8Array<ArrayBuffer>;
    copy.set(chunk);
    chunks.push(copy);
  });

  for (let i = 0; i < doneImages.length; i++) {
    const response = await fetch(blobUrls[i]!);
    const arrayBuf = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuf);

    const entry = new ZipPassThrough(names[i]!);
    zip.add(entry);
    entry.push(data, true);

    onProgress?.(i + 1, doneImages.length);
  }

  zip.end();
  return new Blob(chunks, { type: "application/zip" });
}

// ---------------------------------------------------------------------------
// Download triggers
// ---------------------------------------------------------------------------

/**
 * Trigger a file download from a Blob.
 * Creates a temporary anchor element, clicks it, then cleans up.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Download a single processed image from its Blob URL.
 * Does NOT revoke the URL since it's still needed for preview.
 */
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
