/**
 * Numerate wizard grid math.
 *
 * Two equivalent input modes share the same downstream payload
 * (superpixel_width / superpixel_height — what the Python service
 * consumes). One mode lets the user pick the cell count directly;
 * the other lets them set the pixel size of one cell. The opposite
 * value derives via floor-division, so leftover pixels (when the
 * image isn't an exact multiple) can be surfaced as a warning.
 */
export type GridStats = {
  cellsX: number
  cellsY: number
  superpixelWidth: number
  superpixelHeight: number
  totalCells: number
  coveredWidth: number
  coveredHeight: number
  leftoverWidth: number
  leftoverHeight: number
  isExact: boolean
}

function computeStats(
  imageWidth: number,
  imageHeight: number,
  cellsX: number,
  cellsY: number,
  superpixelWidth: number,
  superpixelHeight: number,
): GridStats {
  const coveredWidth = cellsX * superpixelWidth
  const coveredHeight = cellsY * superpixelHeight
  return {
    cellsX,
    cellsY,
    superpixelWidth,
    superpixelHeight,
    totalCells: cellsX * cellsY,
    coveredWidth,
    coveredHeight,
    leftoverWidth: Math.max(0, imageWidth - coveredWidth),
    leftoverHeight: Math.max(0, imageHeight - coveredHeight),
    isExact: coveredWidth === imageWidth && coveredHeight === imageHeight,
  }
}

export function gridFromCells(
  imageWidth: number,
  imageHeight: number,
  cellsX: number,
  cellsY: number,
): GridStats {
  const safeCellsX = Math.max(1, Math.floor(cellsX))
  const safeCellsY = Math.max(1, Math.floor(cellsY))
  const superpixelWidth = Math.max(1, Math.floor(imageWidth / safeCellsX))
  const superpixelHeight = Math.max(1, Math.floor(imageHeight / safeCellsY))
  return computeStats(imageWidth, imageHeight, safeCellsX, safeCellsY, superpixelWidth, superpixelHeight)
}

export function gridFromSuperpixel(
  imageWidth: number,
  imageHeight: number,
  superpixelWidth: number,
  superpixelHeight: number,
): GridStats {
  const safeW = Math.max(1, Math.floor(superpixelWidth))
  const safeH = Math.max(1, Math.floor(superpixelHeight))
  const cellsX = Math.max(1, Math.floor(imageWidth / safeW))
  const cellsY = Math.max(1, Math.floor(imageHeight / safeH))
  return computeStats(imageWidth, imageHeight, cellsX, cellsY, safeW, safeH)
}
