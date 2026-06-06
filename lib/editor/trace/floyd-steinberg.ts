/**
 * Floyd-Steinberg error-diffusion dithering — client mirror of
 * `filter-service/app/floyd_steinberg.py`.
 *
 * Classical scan-order error diffusion per Floyd & Steinberg (1976),
 * "An Adaptive Algorithm for Spatial Greyscale" (Proc SID 17/2). Each
 * cell is quantised to its nearest palette chip, the residual error
 * `(cell_color − chip_color)` is split across four unprocessed
 * neighbours by the Floyd-Steinberg kernel:
 *
 *       ·   ·   ·
 *       ·   X   7/16
 *       3/16  5/16  1/16   (rows top-to-bottom; X = current cell)
 *
 * Adjacent cells accumulate residual error from already-processed
 * cells, so a uniform-target region renders as a mix of palette chips
 * whose average matches the target.
 *
 * Companion to PR-D's Knoll-Yliluoma dithering — different aesthetic
 * (FS has "worm" patterns along the scan direction; KY has blue-noise
 * spatial mix), same scope. PR-F's `dither_mode` schema field picks
 * between them at wire-up time.
 *
 * Distance metric is squared-Euclidean over the palette's space; the
 * error is propagated in the SAME space so the metric stays self-
 * consistent. Callers choose the space (OKLab from `lib/color/oklab.ts`,
 * CIE Lab from `lib/color/ciede2000.ts`, or any other linear-ish space).
 */

/**
 * Quantise an (H × W × dim) cell grid to a palette by Floyd-Steinberg
 * error diffusion. Returns an (H × W) flat `Int32Array` of palette
 * indices, row-major (`out[y * W + x]`).
 *
 * The cell-mean colours are assumed to be in the same perceptual
 * space as the palette (typically OKLab or CIE Lab). The residual
 * error is propagated in that same space — propagating in sRGB while
 * snapping in OKLab would smear hue.
 *
 * @param cells        flat row-major `cells[y*W*dim + x*dim + d]`,
 *                     length `H*W*dim`
 * @param H            grid height
 * @param W            grid width
 * @param palette      flat row-major `palette[i*dim + d]`, length `M*dim`
 * @param paletteSize  number of palette chips (= M)
 * @param dim          feature dimension (= D, typically 3)
 *
 * @returns (H × W) flat Int32Array of palette indices.
 *
 * Notes:
 *   - Scan order: top-to-bottom, left-to-right (classical FS, not
 *     serpentine).
 *   - Boundaries: errors that would propagate off the grid edge are
 *     discarded (matches the classical algorithm).
 *   - A 1-cell input degenerates to plain nearest-neighbour snap.
 */
export function floydSteinbergDither(
  cells: ReadonlyArray<number> | Float64Array,
  H: number,
  W: number,
  palette: ReadonlyArray<number>,
  paletteSize: number,
  dim: number,
): Int32Array {
  if (H <= 0 || W <= 0) throw new Error(`floydSteinbergDither: H,W must be > 0; got H=${H}, W=${W}`)
  if (cells.length !== H * W * dim) {
    throw new Error(
      `floydSteinbergDither: cells length ${cells.length} != H*W*dim = ${H * W * dim}`,
    )
  }
  if (palette.length !== paletteSize * dim) {
    throw new Error(
      `floydSteinbergDither: palette length ${palette.length} != paletteSize*dim = ${paletteSize * dim}`,
    )
  }
  if (paletteSize <= 0) throw new Error("floydSteinbergDither: paletteSize must be > 0")

  // Working buffer — we mutate it with accumulated residual error.
  const work = new Float64Array(H * W * dim)
  for (let i = 0; i < work.length; i += 1) work[i] = cells[i] as number

  const indices = new Int32Array(H * W)

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const cellBase = (y * W + x) * dim

      // Nearest palette chip by squared-Euclidean distance.
      let bestJ = 0
      let bestD = Infinity
      for (let j = 0; j < paletteSize; j += 1) {
        const pBase = j * dim
        let s = 0
        for (let d = 0; d < dim; d += 1) {
          const diff = palette[pBase + d] - work[cellBase + d]
          s += diff * diff
        }
        if (s < bestD) {
          bestD = s
          bestJ = j
        }
      }
      indices[y * W + x] = bestJ

      // Residual error: cell − chosen palette chip.
      const chosenBase = bestJ * dim
      const error = new Array<number>(dim)
      for (let d = 0; d < dim; d += 1) error[d] = work[cellBase + d] - palette[chosenBase + d]

      // Distribute per the Floyd-Steinberg kernel. Each branch tests
      // grid-boundary inclusion before accumulating — out-of-bounds
      // error is dropped (classical FS).
      if (x + 1 < W) {
        const target = (y * W + (x + 1)) * dim
        for (let d = 0; d < dim; d += 1) work[target + d] += error[d] * (7 / 16)
      }
      if (y + 1 < H) {
        if (x > 0) {
          const target = ((y + 1) * W + (x - 1)) * dim
          for (let d = 0; d < dim; d += 1) work[target + d] += error[d] * (3 / 16)
        }
        const targetS = ((y + 1) * W + x) * dim
        for (let d = 0; d < dim; d += 1) work[targetS + d] += error[d] * (5 / 16)
        if (x + 1 < W) {
          const target = ((y + 1) * W + (x + 1)) * dim
          for (let d = 0; d < dim; d += 1) work[target + d] += error[d] * (1 / 16)
        }
      }
    }
  }

  return indices
}
