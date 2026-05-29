/**
 * Cell-grid texture filter — blue-noise neighbour invasion (client mirror of
 * `filter-service/app/cell_texture.py`).
 *
 * Slots into the live preview after the palette-snap step (`mapCellsToPalette`)
 * and replaces "deep-interior" cells with the locally-dominant neighbouring
 * palette colour. Mirrors the server byte-for-byte: same blue-noise LUT
 * (`public/assets/blue-noise-256.bin`), same interior-score formula, same
 * Moore-radius mode lookup with the same tie-break order (insertion-order
 * iteration over the 5×5 window).
 *
 * The LUT is fetched lazily via {@link loadBlueNoiseLut} and cached. Preview
 * panes await the fetch before passing it to {@link applyNeighborInvasion};
 * before the LUT lands the preview falls back to the snapped (untextured)
 * cells. The shared parity test (`cell-texture.test.ts` ⇄
 * `test_cell_texture.py`) reads the binary off disk and asserts byte-equal
 * outputs against the Python snapshot.
 */
const LUT_URL = "/assets/blue-noise-256.bin"
const LUT_SIZE = 256
const INTERIOR_ALPHA = 3
const INVASION_RADIUS = 2

let cachedLut: Uint8Array | null = null
let inFlightLut: Promise<Uint8Array> | null = null

/**
 * Fetch the committed blue-noise LUT once and cache it. Returns the same
 * 256×256 byte array on every subsequent call. The fetch goes through the
 * browser cache (the binary is immutable and large-ish — 64 KB) so repeat
 * dialog opens are free.
 */
export function loadBlueNoiseLut(): Promise<Uint8Array> {
  if (cachedLut) return Promise.resolve(cachedLut)
  if (inFlightLut) return inFlightLut
  inFlightLut = fetch(LUT_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`blue-noise LUT fetch failed: ${res.status}`)
      return res.arrayBuffer()
    })
    .then((buf) => {
      const u8 = new Uint8Array(buf)
      if (u8.length !== LUT_SIZE * LUT_SIZE) {
        throw new Error(
          `blue-noise LUT has unexpected size: got ${u8.length}, expected ${LUT_SIZE * LUT_SIZE}`,
        )
      }
      cachedLut = u8
      return u8
    })
    .finally(() => {
      inFlightLut = null
    })
  return inFlightLut
}

/** Test-only escape hatch: inject a LUT without going through `fetch`. The
 * parity test reads the committed binary off disk and seeds the cache here so
 * the preview-renderer code paths can run in Node. Not exported from the
 * package barrel — call sites import this file directly. */
export function _setBlueNoiseLutForTesting(lut: Uint8Array | null): void {
  cachedLut = lut
}

/** Row-major flat cell-colour buffer. Mirrors the shape returned by
 * `mapCellsToPalette` in `trace-cell-colors.ts`. */
export type CellColors = {
  r: Uint8ClampedArray
  g: Uint8ClampedArray
  b: Uint8ClampedArray
}

/** Palette chip RGB (immutable triple). Matches `PaletteChip.rgb`. */
export type PaletteRgb = ReadonlyArray<readonly [number, number, number]>

/**
 * Reconstruct each cell's palette index from its RGB. The cells are
 * palette-snapped, so every cell colour equals exactly one chip — a packed
 * uint32 (`R << 16 | G << 8 | B`) hash table makes lookup O(N + M).
 */
function reconstructPaletteIdx(
  cells: CellColors,
  palette: PaletteRgb,
): Int32Array {
  const n = cells.r.length
  const out = new Int32Array(n)
  const map = new Map<number, number>()
  for (let i = 0; i < palette.length; i += 1) {
    const [pr, pg, pb] = palette[i]
    const key = (pr << 16) | (pg << 8) | pb
    if (!map.has(key)) map.set(key, i)
  }
  for (let i = 0; i < n; i += 1) {
    const key = (cells.r[i] << 16) | (cells.g[i] << 8) | cells.b[i]
    const idx = map.get(key)
    if (idx === undefined) {
      throw new Error(
        `applyNeighborInvasion: cell ${i} has colour not in palette (rgb=${cells.r[i]},${cells.g[i]},${cells.b[i]})`,
      )
    }
    out[i] = idx
  }
  return out
}

/**
 * Apply the blue-noise neighbour-invasion texture step. Pure function —
 * returns a NEW `CellColors` triple, input not mutated. When `strength <= 0`
 * the input is returned as-is (fast path; the preview slot calls this even
 * when the texture checkbox is off).
 *
 * `cellsY × cellsX` must equal `cells.r.length`; row-major layout
 * (`cy * cellsX + cx`).
 */
export function applyNeighborInvasion(args: {
  cells: CellColors
  palette: PaletteRgb
  cellsY: number
  cellsX: number
  strength: number
  blueNoiseLut: Uint8Array
}): CellColors {
  const { cells, palette, cellsY, cellsX, strength, blueNoiseLut } = args
  if (strength <= 0) {
    return {
      r: new Uint8ClampedArray(cells.r),
      g: new Uint8ClampedArray(cells.g),
      b: new Uint8ClampedArray(cells.b),
    }
  }
  if (cells.r.length !== cellsY * cellsX) {
    throw new Error(
      `applyNeighborInvasion: cells.r.length (${cells.r.length}) ≠ cellsY·cellsX (${cellsY * cellsX})`,
    )
  }
  if (blueNoiseLut.length !== LUT_SIZE * LUT_SIZE) {
    throw new Error(
      `applyNeighborInvasion: blueNoiseLut must be ${LUT_SIZE * LUT_SIZE} bytes, got ${blueNoiseLut.length}`,
    )
  }

  const paletteIdx = reconstructPaletteIdx(cells, palette)
  const r = new Uint8ClampedArray(cells.r)
  const g = new Uint8ClampedArray(cells.g)
  const b = new Uint8ClampedArray(cells.b)

  for (let cy = 0; cy < cellsY; cy += 1) {
    for (let cx = 0; cx < cellsX; cx += 1) {
      const me = paletteIdx[cy * cellsX + cx]

      let same = 0
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = cy + dy
        if (ny < 0 || ny >= cellsY) continue
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dy === 0 && dx === 0) continue
          const nx = cx + dx
          if (nx < 0 || nx >= cellsX) continue
          if (paletteIdx[ny * cellsX + nx] === me) same += 1
        }
      }
      const interiorScore = same / 8
      const threshold = blueNoiseLut[(cy % LUT_SIZE) * LUT_SIZE + (cx % LUT_SIZE)] / 255
      const cutoff = strength * Math.pow(interiorScore, INTERIOR_ALPHA)
      if (threshold >= cutoff) continue

      // Moore-radius mode lookup. Map iteration is insertion-ordered → strict
      // `>` makes the FIRST max win, matching Python's dict semantics.
      const counts = new Map<number, number>()
      for (let dy = -INVASION_RADIUS; dy <= INVASION_RADIUS; dy += 1) {
        const ny = cy + dy
        if (ny < 0 || ny >= cellsY) continue
        for (let dx = -INVASION_RADIUS; dx <= INVASION_RADIUS; dx += 1) {
          if (dy === 0 && dx === 0) continue
          const nx = cx + dx
          if (nx < 0 || nx >= cellsX) continue
          const nidx = paletteIdx[ny * cellsX + nx]
          if (nidx === me) continue
          counts.set(nidx, (counts.get(nidx) ?? 0) + 1)
        }
      }
      if (counts.size === 0) continue
      let invadingIdx = -1
      let best = 0
      for (const [idx, count] of counts) {
        if (count > best) {
          best = count
          invadingIdx = idx
        }
      }
      const chip = palette[invadingIdx]
      const i = cy * cellsX + cx
      r[i] = chip[0]
      g[i] = chip[1]
      b[i] = chip[2]
    }
  }
  return { r, g, b }
}
