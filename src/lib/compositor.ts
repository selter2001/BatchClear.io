// ---------------------------------------------------------------------------
// Canvas compositor -- full-resolution mask compositing
// ---------------------------------------------------------------------------
// Takes the original image (at full resolution) and a mask (at model
// resolution, typically 1024x1024) and produces a full-resolution PNG with
// transparent background.
//
// Uses OffscreenCanvas throughout so it can run on or off the main thread.
// Aggressively releases canvas memory after use -- critical for iOS Safari
// which has a ~224-384 MB total canvas memory ceiling.
// ---------------------------------------------------------------------------

/**
 * Composite a full-resolution transparent PNG by applying a model-resolution
 * mask to the original image.
 *
 * @param originalBlob - The original image file as a Blob (full resolution)
 * @param maskData     - The mask output from the segmentation model
 * @returns A PNG Blob with transparent background at original resolution
 */
export async function compositeFullResolution(
  originalBlob: Blob,
  maskData: {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    channels: number;
  },
): Promise<Blob> {
  // 1. Load the original image at full resolution
  const originalBitmap = await createImageBitmap(originalBlob);
  const origW = originalBitmap.width;
  const origH = originalBitmap.height;

  // 2. Create mask canvas at model resolution and draw the mask onto it.
  //    IMPORTANT: We create a NEW Uint8ClampedArray from maskData.data because
  //    the original buffer may be neutered after Transferable postMessage.
  const maskCanvas = new OffscreenCanvas(maskData.width, maskData.height);
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) throw new Error("Failed to get 2D context for mask canvas");

  // The mask from the model may be 1-channel (grayscale) or 4-channel (RGBA).
  // ImageData requires RGBA, so we need to expand if necessary.
  let rgbaData: Uint8ClampedArray;
  if (maskData.channels === 1) {
    // Expand single-channel grayscale to RGBA
    rgbaData = new Uint8ClampedArray(maskData.width * maskData.height * 4);
    for (let i = 0; i < maskData.data.length; i++) {
      const val = maskData.data[i]!;
      rgbaData[i * 4] = val; // R
      rgbaData[i * 4 + 1] = val; // G
      rgbaData[i * 4 + 2] = val; // B
      rgbaData[i * 4 + 3] = 255; // A (fully opaque so drawImage scales correctly)
    }
  } else {
    // Already RGBA -- clone to avoid neutered buffer issues
    rgbaData = new Uint8ClampedArray(maskData.data);
  }

  // Ensure the backing buffer is a plain ArrayBuffer (not SharedArrayBuffer)
  // to satisfy the ImageData constructor's type requirements.
  const rgbaBuffer = new Uint8ClampedArray(rgbaData.buffer.slice(0)) as Uint8ClampedArray<ArrayBuffer>;
  const maskImageData = new ImageData(rgbaBuffer, maskData.width, maskData.height);
  maskCtx.putImageData(maskImageData, 0, 0);

  // 3. Scale the mask to original resolution
  const scaledMaskCanvas = new OffscreenCanvas(origW, origH);
  const scaledMaskCtx = scaledMaskCanvas.getContext("2d");
  if (!scaledMaskCtx)
    throw new Error("Failed to get 2D context for scaled mask canvas");

  // Use bilinear interpolation for smooth mask edges at full resolution
  scaledMaskCtx.imageSmoothingEnabled = true;
  scaledMaskCtx.imageSmoothingQuality = "high";
  scaledMaskCtx.drawImage(maskCanvas, 0, 0, origW, origH);
  const scaledMaskPixels = scaledMaskCtx.getImageData(0, 0, origW, origH).data;

  // 4. Draw original image onto output canvas
  const outputCanvas = new OffscreenCanvas(origW, origH);
  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx)
    throw new Error("Failed to get 2D context for output canvas");

  outputCtx.drawImage(originalBitmap, 0, 0);
  const outputImageData = outputCtx.getImageData(0, 0, origW, origH);
  const outputPixels = outputImageData.data;

  // 5. Apply the mask: copy alpha channel from scaled mask to output.
  //    For 1-channel masks expanded to RGBA, the alpha info is in R channel
  //    after scaling. For 4-channel masks, it's in the A channel.
  //    After scaling via drawImage, regardless of input format the meaningful
  //    value is in the alpha channel for RGBA masks, or R/G/B for expanded
  //    grayscale. We use the R channel if the original was 1-channel (since
  //    drawImage may pre-multiply alpha), otherwise use the A channel.
  const alphaOffset = maskData.channels === 1 ? 0 : 3;
  const pixelCount = origW * origH;
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    outputPixels[idx + 3] = scaledMaskPixels[idx + alphaOffset]!;
  }

  // 6. Put modified pixel data back and export as PNG
  outputCtx.putImageData(outputImageData, 0, 0);
  const resultBlob = await outputCanvas.convertToBlob({ type: "image/png" });

  // 7. CRITICAL -- Memory cleanup: Release all canvas and bitmap memory.
  //    Shrinking canvases to 1x1 forces the browser to release GPU/canvas
  //    backing stores immediately rather than waiting for GC.
  maskCanvas.width = 1;
  maskCanvas.height = 1;
  scaledMaskCanvas.width = 1;
  scaledMaskCanvas.height = 1;
  outputCanvas.width = 1;
  outputCanvas.height = 1;
  originalBitmap.close();

  return resultBlob;
}
