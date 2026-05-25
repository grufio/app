/**
 * Shared client-side color detection for trace previews.
 *
 * The single place where a trace preview turns source pixels into per-cell
 * colours — used by Pixelate and (soon) Circulate and any future trace, so a
 * change to the colour model is made in ONE spot. The server mirror is
 * `filter-service/app/cell_colors.py`; they must stay in lockstep (the
 * authoritative SVG comes from the server, this only drives the live preview).
 *
 * Today: a true per-cell area-average (`cellAreaAverages`), geometrically
 * equivalent to the server's `Image.BOX` downsample, then `mapCellsToPalette`
 * snaps each cell to the nearest Munsell chip via OKLab — mirroring the
 * server (`filter-service/app/cell_colors.py`).
 */
import { nearestPaletteIndex, rgb255ToOklab, rotateHueOklab, type Oklab } from "@/lib/color/oklab"

/**
 * Pure per-cell area-average. Given a flat RGBA buffer (`width × height`,
 * row-major, 4 bytes/pixel) it partitions the buffer into a
 * `cellsX × cellsY` grid and returns the mean R/G/B of every source
 * pixel in each cell, row-major (`cy * cellsX + cx`).
 *
 * Each source pixel is assigned to exactly one cell via
 * `floor(p * cells / size)`, so every pixel contributes to precisely
 * one cell and all pixels in a cell are averaged — a genuine
 * area-average aligned to the cell grid (geometrically equivalent to
 * the server's `Image.BOX`). Canvas-free, so it is unit-testable
 * without a DOM.
 */
export function cellAreaAverages(args: {
  rgba: Uint8ClampedArray
  width: number
  height: number
  cellsX: number
  cellsY: number
}): { r: Uint8ClampedArray; g: Uint8ClampedArray; b: Uint8ClampedArray } {
  const { rgba, width, height, cellsX, cellsY } = args
  const cellCount = cellsX * cellsY
  const sumR = new Float64Array(cellCount)
  const sumG = new Float64Array(cellCount)
  const sumB = new Float64Array(cellCount)
  const count = new Uint32Array(cellCount)

  for (let py = 0; py < height; py += 1) {
    const cy = Math.min(cellsY - 1, Math.floor((py * cellsY) / height))
    const cellRow = cy * cellsX
    const rowBase = py * width * 4
    for (let px = 0; px < width; px += 1) {
      const cx = Math.min(cellsX - 1, Math.floor((px * cellsX) / width))
      const ci = cellRow + cx
      const o = rowBase + px * 4
      sumR[ci] += rgba[o]
      sumG[ci] += rgba[o + 1]
      sumB[ci] += rgba[o + 2]
      count[ci] += 1
    }
  }

  const r = new Uint8ClampedArray(cellCount)
  const g = new Uint8ClampedArray(cellCount)
  const b = new Uint8ClampedArray(cellCount)
  for (let i = 0; i < cellCount; i += 1) {
    const n = count[i] || 1
    r[i] = Math.round(sumR[i] / n)
    g[i] = Math.round(sumG[i] / n)
    b[i] = Math.round(sumB[i] / n)
  }
  return { r, g, b }
}

/** One palette chip: OKLab (for matching) + RGB (the emitted colour). Mirrors
 * the `/api/palette` response and the server `lib/supabase/palette.ts` shape. */
export type PaletteChip = { oklab: Oklab; rgb: readonly [number, number, number] }

type CellColors = { r: Uint8ClampedArray; g: Uint8ClampedArray; b: Uint8ClampedArray }

/**
 * Snap each per-cell mean to the nearest palette chip (OKLab nearest),
 * mirroring the server's `map_cells_to_palette`. Returns new channel arrays;
 * an empty palette returns the input unchanged (raw means).
 */
export function mapCellsToPalette(cells: CellColors, palette: ReadonlyArray<PaletteChip>): CellColors {
  if (palette.length === 0) return cells
  const paletteOklab = palette.map((c) => c.oklab)
  const n = cells.r.length
  const r = new Uint8ClampedArray(n)
  const g = new Uint8ClampedArray(n)
  const b = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i += 1) {
    const idx = nearestPaletteIndex(rgb255ToOklab(cells.r[i], cells.g[i], cells.b[i]), paletteOklab)
    const chip = palette[idx].rgb
    r[i] = chip[0]
    g[i] = chip[1]
    b[i] = chip[2]
  }
  return { r, g, b }
}

/**
 * Like {@link mapCellsToPalette} but rotates each cell mean's hue by
 * `hueShiftDeg` (OKLCh) before snapping to the nearest chip — Circulate's
 * inner-ellipse colour. Mirror of the server's `_inner_colors`
 * (`filter-service/app/circulate.py`); the shifted colour stays in the
 * palette. `hueShiftDeg === 0` reduces to {@link mapCellsToPalette}. An empty
 * palette returns the input unchanged (raw means).
 */
export function mapCellsToPaletteHueShifted(
  cells: CellColors,
  palette: ReadonlyArray<PaletteChip>,
  hueShiftDeg: number,
): CellColors {
  if (palette.length === 0) return cells
  const paletteOklab = palette.map((c) => c.oklab)
  const n = cells.r.length
  const r = new Uint8ClampedArray(n)
  const g = new Uint8ClampedArray(n)
  const b = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i += 1) {
    const shifted = rotateHueOklab(rgb255ToOklab(cells.r[i], cells.g[i], cells.b[i]), hueShiftDeg)
    const chip = palette[nearestPaletteIndex(shifted, paletteOklab)].rgb
    r[i] = chip[0]
    g[i] = chip[1]
    b[i] = chip[2]
  }
  return { r, g, b }
}
