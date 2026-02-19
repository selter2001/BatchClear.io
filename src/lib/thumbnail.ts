// ---------------------------------------------------------------------------
// Thumbnail generator -- produces display-size blob URLs for grid previews
// ---------------------------------------------------------------------------
// Full-resolution images cause OOM in Safari (which decodes every <img> at
// native resolution regardless of display size). By generating ~600px
// thumbnails for grid display and keeping full-res URLs only for download,
// we reduce decoded bitmap memory from ~3.5 GB to ~70 MB for 24 images.
// ---------------------------------------------------------------------------

/**
 * Create a display-size thumbnail blob URL from a full-resolution blob.
 * If the image is already within maxDim, returns a blob URL to the original.
 *
 * @param blob   - Source image blob (JPEG, PNG, etc.)
 * @param maxDim - Maximum dimension (width or height) for the thumbnail
 * @param format - Output format ("image/jpeg" for opaque, "image/png" for transparent)
 * @returns A blob URL pointing to the thumbnail
 */
export async function createThumbnailUrl(
  blob: Blob,
  maxDim = 600,
  format: "image/jpeg" | "image/png" = "image/jpeg",
): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;

  // Already small enough -- just create a blob URL for the original
  if (width <= maxDim && height <= maxDim) {
    bitmap.close();
    return URL.createObjectURL(blob);
  }

  const scale = maxDim / Math.max(width, height);
  const thumbW = Math.round(width * scale);
  const thumbH = Math.round(height * scale);

  const canvas = new OffscreenCanvas(thumbW, thumbH);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return URL.createObjectURL(blob);
  }

  ctx.drawImage(bitmap, 0, 0, thumbW, thumbH);
  bitmap.close();

  const thumbBlob = await canvas.convertToBlob({
    type: format,
    quality: format === "image/jpeg" ? 0.8 : undefined,
  });

  // Release canvas memory immediately
  canvas.width = 1;
  canvas.height = 1;

  return URL.createObjectURL(thumbBlob);
}
