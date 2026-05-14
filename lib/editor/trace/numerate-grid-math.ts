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

/**
 * Hard cap on cells per axis in the wizard's "number of cells" mode.
 * `gridFromCells` enforces it, so the cells input can never produce a
 * grid above 50x50 — keeps the numerate SVG (one path per region +
 * the grid lines) from blowing up.
 */
export const MAX_CELLS_PER_AXIS = 50

/**
 * Soft cap on total cells in "superpixel size" mode. Above this the
 * wizard warns that the trace will be large/slow, but does not block —
 * the pitch-driven mode is the power-user path.
 */
export const MAX_SUPERPIXEL_TOTAL_CELLS = 2500

/**
 * Minimum physical supercell size, in millimetres, per axis. A
 * supercell smaller than this makes the numerate grid too fine to be
 * a usable paint-by-numbers cell. Enforced as a hard wizard-validation
 * rule (Apply is blocked until met). The mm size is derived from the
 * supercell pitch in image pixels and the project's output DPI.
 */
export const MIN_SUPERCELL_MM = 4

/**
 * Default physical supercell size, in millimetres, per axis. The
 * wizard seeds the supercell pitch to this on open (converted to
 * image px via the project DPI) — comfortably above MIN_SUPERCELL_MM
 * so the grid step opens valid.
 */
export const DEFAULT_SUPERCELL_MM = 6

export function gridFromCells(
  imageWidth: number,
  imageHeight: number,
  cellsX: number,
  cellsY: number,
): GridStats {
  const safeCellsX = Math.min(MAX_CELLS_PER_AXIS, Math.max(1, Math.floor(cellsX)))
  const safeCellsY = Math.min(MAX_CELLS_PER_AXIS, Math.max(1, Math.floor(cellsY)))
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
