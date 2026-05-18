/**
 * Numerate grid math.
 *
 * One input: `supercell_mm` — the square superpixel edge length in
 * millimetres. The image's displayed size on the artboard (in mm) is
 * passed in directly; the wizard and the server both convert their
 * own way (display-state ↔ workspace-DPI), but the grid math itself
 * works purely in mm so it can't drift between caller and consumer.
 *
 * Cells per axis = floor(displayMm / supercell_mm), independent per
 * axis. Whatever doesn't divide into a whole superpixel becomes a
 * centred border that gets cropped at trace time.
 */

/** Minimum supercell edge length in mm. Below this the grid is too
 * fine to be a usable paint-by-numbers cell. Hard-blocked by Apply. */
export const MIN_SUPERCELL_MM = 4

/** Default supercell edge length in mm — comfortably above MIN so
 * the dialog opens valid. */
export const DEFAULT_SUPERCELL_MM = 6

export type NumerateGridParams = {
  supercell_mm: number
}

export type NumerateGrid = {
  /** Whole-superpixel count per axis (= floor(displayMm / supercellMm)). */
  cellsX: number
  cellsY: number
  /** Superpixel edge length the grid uses (= input). */
  supercellMm: number
  /** Image dimensions on the artboard, in mm. */
  displayMmW: number
  displayMmH: number
  /** Grid coverage in mm (= cells × supercellMm). */
  usedMmW: number
  usedMmH: number
  /** Leftover mm per axis (= displayMm - usedMm), split evenly as the
   * centred border that gets cropped at trace time. */
  borderMmX: number
  borderMmY: number
}

export function resolveNumerateGrid(
  displayMmW: number,
  displayMmH: number,
  params: NumerateGridParams,
): NumerateGrid {
  const supercellMm = Math.max(0, params.supercell_mm)
  const cellsX = supercellMm > 0 ? Math.floor(displayMmW / supercellMm) : 0
  const cellsY = supercellMm > 0 ? Math.floor(displayMmH / supercellMm) : 0
  const usedMmW = cellsX * supercellMm
  const usedMmH = cellsY * supercellMm
  return {
    cellsX,
    cellsY,
    supercellMm,
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
export function isNumerateGridValid(grid: NumerateGrid): boolean {
  return grid.cellsX >= 1 && grid.cellsY >= 1
}
