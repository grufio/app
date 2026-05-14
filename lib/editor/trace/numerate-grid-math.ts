/**
 * Numerate grid math.
 *
 * The numerate trace produces a tiny image where 1 cell = 1 pixel
 * (e.g. 100×75 px), rendered as a scalable SVG. The wizard inputs are:
 *
 *   - `supercell_mm` — the base supercell size in millimetres (one
 *     superpixel, the common divisor). Square unless a multiple is set.
 *   - `multiple_axis` + `multiple` — optionally stretch the supercell
 *     on ONE axis by an integer factor → rectangular cells.
 *   - `primary_count` — the EXACT cell count on the primary axis. The
 *     primary axis is picked from image orientation (landscape →
 *     horizontal, portrait → vertical).
 *
 * The secondary axis count is derived: as many whole cells as fit.
 * Whatever does not divide evenly stays as a centred border — cells
 * are never stretched and no strip is silently cropped.
 *
 * `resolveNumerateGrid` is the single source of truth: the wizard
 * uses it for the live grid summary, the server uses it to compute
 * the cell count + crop rect it hands to the Python filter-service.
 */

/** Minimum base supercell size, in millimetres. Below this the grid
 * is too fine to be a usable paint-by-numbers cell — enforced as a
 * hard wizard-validation rule (Apply blocked until met). */
export const MIN_SUPERCELL_MM = 4

/** Default base supercell size, in millimetres — comfortably above
 * MIN_SUPERCELL_MM so the wizard opens valid. */
export const DEFAULT_SUPERCELL_MM = 6

/** Default exact cell count on the primary axis. */
export const DEFAULT_PRIMARY_COUNT = 40

export type MultipleAxis = "none" | "horizontal" | "vertical"

export type NumerateGridParams = {
  supercell_mm: number
  multiple_axis: MultipleAxis
  multiple: number
  primary_count: number
}

export type NumerateGrid = {
  /** Which axis carries the user's exact `primary_count`. */
  primaryAxis: "horizontal" | "vertical"
  /** Cell count per axis. The primary axis equals `primary_count`;
   * the secondary is derived (whole cells that fit). Either can be 0
   * for degenerate inputs — callers validate `>= 1`. */
  cellsX: number
  cellsY: number
  /** Physical cell size in millimetres (square unless a multiple is
   * applied to one axis). */
  cellMmW: number
  cellMmH: number
  /** Source-image crop rect (px) the grid covers — the part inside
   * the cells. The primary axis covers the image fully; the
   * secondary axis is centred, leaving `borderPx` total leftover. */
  cropX: number
  cropY: number
  cropW: number
  cropH: number
  /** Total leftover on the secondary axis (px), split evenly as the
   * centred border. 0 when the format divides evenly. */
  borderPx: number
}

/**
 * Resolve the numerate grid from the source image dimensions and the
 * wizard params. Pure — same inputs always give the same grid, so
 * wizard and server stay in lockstep without re-deriving differently.
 */
export function resolveNumerateGrid(
  imageWidth: number,
  imageHeight: number,
  params: NumerateGridParams,
): NumerateGrid {
  const supercell = Math.max(0, params.supercell_mm)
  const mult = Math.max(1, Math.floor(params.multiple))
  const cellMmW = supercell * (params.multiple_axis === "horizontal" ? mult : 1)
  const cellMmH = supercell * (params.multiple_axis === "vertical" ? mult : 1)
  const primaryCount = Math.max(1, Math.floor(params.primary_count))

  const primaryAxis: "horizontal" | "vertical" =
    imageWidth >= imageHeight ? "horizontal" : "vertical"

  // The source block sampled per cell has the same aspect ratio as
  // the physical cell, so square cells sample square source blocks
  // and rectangular cells sample proportionally rectangular blocks.
  if (primaryAxis === "horizontal") {
    const cellsX = primaryCount
    const cellSourcePxW = imageWidth / cellsX
    const cellSourcePxH = cellSourcePxW * (cellMmH / cellMmW)
    const cellsY = Math.floor(imageHeight / cellSourcePxH)
    const cropW = imageWidth
    const cropH = cellsY * cellSourcePxH
    const cropY = (imageHeight - cropH) / 2
    return {
      primaryAxis,
      cellsX,
      cellsY,
      cellMmW,
      cellMmH,
      cropX: 0,
      cropY,
      cropW,
      cropH,
      borderPx: imageHeight - cropH,
    }
  }

  const cellsY = primaryCount
  const cellSourcePxH = imageHeight / cellsY
  const cellSourcePxW = cellSourcePxH * (cellMmW / cellMmH)
  const cellsX = Math.floor(imageWidth / cellSourcePxW)
  const cropH = imageHeight
  const cropW = cellsX * cellSourcePxW
  const cropX = (imageWidth - cropW) / 2
  return {
    primaryAxis,
    cellsX,
    cellsY,
    cellMmW,
    cellMmH,
    cropX,
    cropY: 0,
    cropW,
    cropH,
    borderPx: imageWidth - cropW,
  }
}

/** True when the resolved grid is usable: at least one whole cell on
 * each axis and the crop fits inside the image. The wizard hard-blocks
 * Apply until this holds. */
export function isNumerateGridValid(grid: NumerateGrid): boolean {
  return (
    grid.cellsX >= 1 &&
    grid.cellsY >= 1 &&
    grid.cropW > 0 &&
    grid.cropH > 0
  )
}
