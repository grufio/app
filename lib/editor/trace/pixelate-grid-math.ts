/**
 * Pixelate grid math.
 *
 * Two inputs: `supercell_width_mm` and `supercell_height_mm` — the
 * superpixel edge lengths in millimetres (rectangular cells allowed).
 * The image's displayed size on the artboard (in mm) is passed in
 * directly; the wizard and the server both convert their own way
 * (display-state ↔ workspace-DPI), but the grid math itself works
 * purely in mm so it can't drift between caller and consumer.
 *
 * Cells per axis = floor(displayMm / supercellAxisMm), independent per
 * axis. Whatever doesn't divide into a whole superpixel becomes a
 * centred border that gets cropped at trace time.
 */

/** Minimum supercell edge length in mm. Below this the grid is too
 * fine to be a usable paint-by-numbers cell. Hard-blocked by Apply. */
export const MIN_SUPERCELL_MM = 4

/** Default supercell edge length in mm — comfortably above MIN so
 * the dialog opens valid. Applies to both width and height. */
export const DEFAULT_SUPERCELL_MM = 6

export type PixelateGridParams = {
  supercell_width_mm: number
  supercell_height_mm: number
}

export type PixelateGrid = {
  /** Whole-superpixel count per axis (= floor(displayMm / supercellAxisMm)). */
  cellsX: number
  cellsY: number
  /** Superpixel edge lengths the grid uses (= input). */
  supercellWidthMm: number
  supercellHeightMm: number
  /** Image dimensions on the artboard, in mm. */
  displayMmW: number
  displayMmH: number
  /** Grid coverage in mm (= cells × supercellAxisMm). */
  usedMmW: number
  usedMmH: number
  /** Total leftover mm per axis (= displayMm - usedMm). Split evenly
   * as the centred border that gets cropped at trace time. */
  borderMmX: number
  borderMmY: number
}

export function resolvePixelateGrid(
  displayMmW: number,
  displayMmH: number,
  params: PixelateGridParams,
): PixelateGrid {
  const supercellWidthMm = Math.max(0, params.supercell_width_mm)
  const supercellHeightMm = Math.max(0, params.supercell_height_mm)
  const cellsX = supercellWidthMm > 0 ? Math.floor(displayMmW / supercellWidthMm) : 0
  const cellsY = supercellHeightMm > 0 ? Math.floor(displayMmH / supercellHeightMm) : 0
  const usedMmW = cellsX * supercellWidthMm
  const usedMmH = cellsY * supercellHeightMm
  return {
    cellsX,
    cellsY,
    supercellWidthMm,
    supercellHeightMm,
    displayMmW,
    displayMmH,
    usedMmW,
    usedMmH,
    borderMmX: displayMmW - usedMmW,
    borderMmY: displayMmH - usedMmH,
  }
}

/** True when the resolved grid is usable: at least one whole
 * superpixel on each axis. */
export function isPixelateGridValid(grid: PixelateGrid): boolean {
  return grid.cellsX >= 1 && grid.cellsY >= 1
}

/**
 * Maps the centred mm-space crop (`grid.borderMm/2 … usedMm`) onto a
 * pixel-space crop rect, given the image's pixel dimensions. Used on
 * both client (with `scratch.width/height`) and server (with the
 * source image's `origWidth/origHeight`) so the crop algorithm lives
 * in exactly one place.
 *
 * Returns the top-left corner + size of the cropped region, in the
 * same pixel-space as `pixelW/pixelH`.
 */
export function centeredCropPixels(args: {
  pixelW: number
  pixelH: number
  displayMmW: number
  displayMmH: number
  grid: PixelateGrid
}): { x: number; y: number; w: number; h: number } {
  const { pixelW, pixelH, displayMmW, displayMmH, grid } = args
  const pxPerMmX = pixelW / displayMmW
  const pxPerMmY = pixelH / displayMmH
  return {
    x: (grid.borderMmX / 2) * pxPerMmX,
    y: (grid.borderMmY / 2) * pxPerMmY,
    w: grid.usedMmW * pxPerMmX,
    h: grid.usedMmH * pxPerMmY,
  }
}
