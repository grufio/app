/**
 * Image dimension extraction (UI-agnostic).
 *
 * Responsibilities:
 * - Read intrinsic image dimensions from a `File` without uploading it.
 *
 * Notes:
 * - Preserves the existing fallback order:
 *   1) `createImageBitmap` (fast + no DOM)
 *   2) `<img>` + object URL (fallback)
 */
export async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  // Prefer createImageBitmap when available.
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(file)
    const dims = { width: bmp.width, height: bmp.height }
    bmp.close()
    return dims
  }

  // Fallback: <img> + objectURL
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error("Failed to load image"))
      img.src = objectUrl
    })
    return { width: img.naturalWidth, height: img.naturalHeight }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

