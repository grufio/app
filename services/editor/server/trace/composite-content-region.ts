import sharp from "sharp"

import type { ContentRegionPlan } from "@/lib/editor/trace/content-region"

/**
 * Render the trace input for the content region: a white canvas the size of the
 * content rect (at the image's source-pixel density) with the placed image
 * composited where it covers. Uncovered areas stay white. Produces a PNG buffer
 * that the trace handlers consume like a normal source bitmap.
 *
 * The compositing plan comes from `computeContentRegionPlan` (pure geometry).
 */
export async function compositeContentRegion(args: {
  sourceBuffer: Buffer
  plan: Extract<ContentRegionPlan, { ok: true }>
}): Promise<Buffer> {
  const { sourceBuffer, plan } = args
  const { canvasPx, composite } = plan

  const white = sharp({
    create: {
      width: canvasPx.widthPx,
      height: canvasPx.heightPx,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })

  if (!composite) {
    // No coverage → all white.
    return white.png().toBuffer()
  }

  // Extract the visible sub-rect of the source, then composite it onto white.
  const piece = await sharp(sourceBuffer)
    .extract({
      left: composite.extract.left,
      top: composite.extract.top,
      width: composite.extract.width,
      height: composite.extract.height,
    })
    // Flatten any alpha over white so uncovered/transparent source pixels don't
    // punch holes in the white canvas.
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .toBuffer()

  return white
    .composite([{ input: piece, left: composite.placeAt.left, top: composite.placeAt.top }])
    .png()
    .toBuffer()
}
