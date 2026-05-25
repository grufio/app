/**
 * Circulate grid math.
 *
 * Like the pixelate grid, the cell count per axis derives purely from the
 * image's displayed size on the artboard (mm) and the cell PITCH, so it can't
 * drift between the wizard preview and the server. The pitch per axis is
 *
 *   pitch = spacing-before + outer-ellipse + spacing-after
 *
 * and `cells = floor(displayMm / pitch)`. Whatever doesn't divide into a whole
 * pitch becomes a centred border cropped at trace time (shared
 * `centeredCropPixels`, since the border/used fields match the pixelate grid).
 *
 * The ellipse axes are emitted to the renderer as FRACTIONS of the pitch (the
 * Python service draws in crop-pixel space and stays mm-agnostic, mirroring
 * pixelate).
 */

export type CirculateGridParams = {
  outer_width_mm: number
  outer_height_mm: number
  spacing_left_mm: number
  spacing_right_mm: number
  spacing_top_mm: number
  spacing_bottom_mm: number
}

export type CirculateGrid = {
  /** Whole-cell count per axis (= floor(displayMm / pitch)). */
  cellsX: number
  cellsY: number
  /** Cell pitch per axis in mm (spacing-before + outer + spacing-after). */
  pitchWMm: number
  pitchHMm: number
  /** Image dimensions on the artboard, in mm. */
  displayMmW: number
  displayMmH: number
  /** Grid coverage in mm (= cells × pitch). */
  usedMmW: number
  usedMmH: number
  /** Total leftover mm per axis (= displayMm - usedMm), the centred border
   * cropped at trace time. Same field names as PixelateGrid so the shared
   * `centeredCropPixels` accepts this grid. */
  borderMmX: number
  borderMmY: number
}

export function resolveCirculateGrid(
  displayMmW: number,
  displayMmH: number,
  params: CirculateGridParams,
): CirculateGrid {
  const pitchWMm =
    Math.max(0, params.spacing_left_mm) +
    Math.max(0, params.outer_width_mm) +
    Math.max(0, params.spacing_right_mm)
  const pitchHMm =
    Math.max(0, params.spacing_top_mm) +
    Math.max(0, params.outer_height_mm) +
    Math.max(0, params.spacing_bottom_mm)
  const cellsX = pitchWMm > 0 ? Math.floor(displayMmW / pitchWMm) : 0
  const cellsY = pitchHMm > 0 ? Math.floor(displayMmH / pitchHMm) : 0
  const usedMmW = cellsX * pitchWMm
  const usedMmH = cellsY * pitchHMm
  return {
    cellsX,
    cellsY,
    pitchWMm,
    pitchHMm,
    displayMmW,
    displayMmH,
    usedMmW,
    usedMmH,
    borderMmX: displayMmW - usedMmW,
    borderMmY: displayMmH - usedMmH,
  }
}

/** True when the resolved grid is usable: at least one whole cell per axis. */
export function isCirculateGridValid(grid: CirculateGrid): boolean {
  return grid.cellsX >= 1 && grid.cellsY >= 1
}

/** Ellipse axes as a fraction of the cell pitch (0..1), what the Python
 * renderer expects. An ellipse can't exceed its cell, so each fraction is
 * clamped to ≤ 1 (the inner ellipse can be configured larger than the pitch;
 * clamping keeps the renderer's `(0, 1]` contract). */
export function circulateEllipseFractions(
  grid: Pick<CirculateGrid, "pitchWMm" | "pitchHMm">,
  params: {
    outer_width_mm: number
    outer_height_mm: number
    inner_width_mm: number
    inner_height_mm: number
  },
): { outerWFrac: number; outerHFrac: number; innerWFrac: number; innerHFrac: number } {
  const fracW = (mm: number) => Math.min(1, mm / grid.pitchWMm)
  const fracH = (mm: number) => Math.min(1, mm / grid.pitchHMm)
  return {
    outerWFrac: fracW(params.outer_width_mm),
    outerHFrac: fracH(params.outer_height_mm),
    innerWFrac: fracW(params.inner_width_mm),
    innerHFrac: fracH(params.inner_height_mm),
  }
}
