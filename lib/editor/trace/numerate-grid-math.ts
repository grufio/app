/**
 * Numerate wizard grid math.
 *
 * Float-pitch model (F22 follow-up). The wizard speaks "number of
 * cells" as its primary unit; the superpixel pitch is `imageDim /
 * cellCount`, which is generally fractional. The Python service
 * uses the float pitch to compute exact-coverage SVG geometry, and
 * rounds internally only for the bitmap-quantisation step.
 *
 * Coverage is always exact (no leftover, no cropping in the
 * visible output), so the stats here track cells + float pitch + a
 * derived "effective pitch" without an isExact / leftover concept.
 */
export type GridStats = {
  cellsX: number
  cellsY: number
  superpixelWidth: number
  superpixelHeight: number
  totalCells: number
}

export function gridFromCells(
  imageWidth: number,
  imageHeight: number,
  cellsX: number,
  cellsY: number,
): GridStats {
  const safeCellsX = Math.max(1, Math.floor(cellsX))
  const safeCellsY = Math.max(1, Math.floor(cellsY))
  return {
    cellsX: safeCellsX,
    cellsY: safeCellsY,
    superpixelWidth: imageWidth / safeCellsX,
    superpixelHeight: imageHeight / safeCellsY,
    totalCells: safeCellsX * safeCellsY,
  }
}

export function gridFromSuperpixel(
  imageWidth: number,
  imageHeight: number,
  superpixelWidth: number,
  superpixelHeight: number,
): GridStats {
  const safeW = Math.max(0.1, superpixelWidth)
  const safeH = Math.max(0.1, superpixelHeight)
  const cellsX = Math.max(1, Math.round(imageWidth / safeW))
  const cellsY = Math.max(1, Math.round(imageHeight / safeH))
  return {
    cellsX,
    cellsY,
    superpixelWidth: safeW,
    superpixelHeight: safeH,
    totalCells: cellsX * cellsY,
  }
}
