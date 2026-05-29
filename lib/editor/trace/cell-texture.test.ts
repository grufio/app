import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  _setBlueNoiseLutForTesting,
  applyNeighborInvasion,
  loadBlueNoiseLut,
  type CellColors,
  type PaletteRgb,
} from "./cell-texture"

/**
 * Cell-texture parity test (client side). The SAME reference vectors are
 * asserted in the Python mirror `filter-service/tests/test_cell_texture.py`.
 * If TS and Python ever diverge on the algorithm — or the committed
 * `public/assets/blue-noise-256.bin` changes — one side fails here.
 */

const PALETTE: PaletteRgb = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
] as const

// Input palette indices (row-major, 8×8). Same as INPUT_IDX in the Python
// mirror — a large red field with a small green cluster bottom-right and
// one isolated blue cell at (5, 3).
const INPUT_IDX: ReadonlyArray<number> = [
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 1, 1,
  0, 0, 0, 2, 0, 0, 1, 1,
  0, 0, 0, 0, 0, 0, 1, 1,
  0, 0, 0, 0, 0, 0, 1, 1,
]

// Expected outputs, captured from the Python implementation. Any divergence
// from these = server and client would render different SVGs for the same
// params.
const EXPECTED_BY_STRENGTH: ReadonlyArray<{ strength: number; expected: number[] }> = [
  {
    strength: 0,
    expected: [
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 1, 1,
      0, 0, 0, 2, 0, 0, 1, 1,
      0, 0, 0, 0, 0, 0, 1, 1,
      0, 0, 0, 0, 0, 0, 1, 1,
    ],
  },
  {
    strength: 0.6,
    expected: [
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 1, 1, 0,
      0, 0, 2, 0, 1, 0, 1, 0,
      0, 2, 2, 2, 0, 0, 1, 1,
      0, 0, 0, 2, 0, 0, 1, 1,
      0, 2, 0, 2, 1, 0, 1, 1,
      0, 2, 0, 0, 0, 0, 1, 0,
    ],
  },
  {
    strength: 1,
    expected: [
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 1, 1, 1, 0,
      0, 2, 2, 2, 1, 0, 1, 0,
      0, 2, 2, 2, 0, 1, 1, 1,
      0, 2, 2, 2, 0, 1, 1, 1,
      0, 2, 0, 2, 1, 0, 1, 1,
      0, 2, 0, 2, 0, 0, 1, 0,
    ],
  },
]

const CELLS_X = 8
const CELLS_Y = 8

function buildInputCells(): CellColors {
  const n = INPUT_IDX.length
  const r = new Uint8ClampedArray(n)
  const g = new Uint8ClampedArray(n)
  const b = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i += 1) {
    const chip = PALETTE[INPUT_IDX[i]]
    r[i] = chip[0]
    g[i] = chip[1]
    b[i] = chip[2]
  }
  return { r, g, b }
}

function rgbToIdx(cells: CellColors): number[] {
  const out: number[] = []
  for (let i = 0; i < cells.r.length; i += 1) {
    const r = cells.r[i]
    const g = cells.g[i]
    const b = cells.b[i]
    let found = -1
    for (let k = 0; k < PALETTE.length; k += 1) {
      const c = PALETTE[k]
      if (c[0] === r && c[1] === g && c[2] === b) {
        found = k
        break
      }
    }
    if (found < 0) throw new Error(`cell ${i} not in palette: ${r},${g},${b}`)
    out.push(found)
  }
  return out
}

// Load the committed LUT from disk and seed the in-module cache so the
// renderer-shape APIs (`loadBlueNoiseLut`) round-trip in Node tests.
const LUT_PATH = fileURLToPath(new URL("../../../public/assets/blue-noise-256.bin", import.meta.url))
const LUT = new Uint8Array(readFileSync(LUT_PATH))

describe("blue-noise LUT — shipped binary sanity", () => {
  it("is 256×256 bytes and every value 0..255 appears exactly 256 times", () => {
    expect(LUT.length).toBe(256 * 256)
    const counts = new Uint32Array(256)
    for (let i = 0; i < LUT.length; i += 1) counts[LUT[i]] += 1
    for (let v = 0; v < 256; v += 1) {
      expect(counts[v], `value ${v}`).toBe(256)
    }
  })

  it("loadBlueNoiseLut returns the cached instance once seeded", async () => {
    _setBlueNoiseLutForTesting(LUT)
    try {
      const got = await loadBlueNoiseLut()
      expect(got).toBe(LUT)
    } finally {
      _setBlueNoiseLutForTesting(null)
    }
  })
})

describe("applyNeighborInvasion — strength=0 fast path", () => {
  it("returns a fresh copy equal to the input", () => {
    const cells = buildInputCells()
    const out = applyNeighborInvasion({
      cells,
      palette: PALETTE,
      cellsY: CELLS_Y,
      cellsX: CELLS_X,
      strength: 0,
      blueNoiseLut: LUT,
    })
    expect(out.r).not.toBe(cells.r)
    expect(Array.from(out.r)).toEqual(Array.from(cells.r))
    expect(Array.from(out.g)).toEqual(Array.from(cells.g))
    expect(Array.from(out.b)).toEqual(Array.from(cells.b))
  })

  it("treats negative strength as off", () => {
    const cells = buildInputCells()
    const out = applyNeighborInvasion({
      cells,
      palette: PALETTE,
      cellsY: CELLS_Y,
      cellsX: CELLS_X,
      strength: -0.5,
      blueNoiseLut: LUT,
    })
    expect(Array.from(out.r)).toEqual(Array.from(cells.r))
  })
})

describe("applyNeighborInvasion — Python parity vectors", () => {
  it("matches the snapshot for every strength", () => {
    for (const { strength, expected } of EXPECTED_BY_STRENGTH) {
      const cells = buildInputCells()
      const out = applyNeighborInvasion({
        cells,
        palette: PALETTE,
        cellsY: CELLS_Y,
        cellsX: CELLS_X,
        strength,
        blueNoiseLut: LUT,
      })
      const got = rgbToIdx(out)
      expect(got, `strength=${strength}`).toEqual(expected)
    }
  })

  it("output cells are always palette chips (no invented colours)", () => {
    const cells = buildInputCells()
    const out = applyNeighborInvasion({
      cells,
      palette: PALETTE,
      cellsY: CELLS_Y,
      cellsX: CELLS_X,
      strength: 1,
      blueNoiseLut: LUT,
    })
    const paletteSet = new Set(PALETTE.map((c) => `${c[0]},${c[1]},${c[2]}`))
    for (let i = 0; i < out.r.length; i += 1) {
      const key = `${out.r[i]},${out.g[i]},${out.b[i]}`
      expect(paletteSet.has(key), `cell ${i}: ${key}`).toBe(true)
    }
  })

  it("isolated cells (interior_score=0) survive every strength", () => {
    for (const strength of [0.25, 0.5, 0.75, 1]) {
      const cells = buildInputCells()
      const out = applyNeighborInvasion({
        cells,
        palette: PALETTE,
        cellsY: CELLS_Y,
        cellsX: CELLS_X,
        strength,
        blueNoiseLut: LUT,
      })
      // The blue cell at (5, 3) has no same-colour Moore-1 neighbours.
      const i = 5 * CELLS_X + 3
      expect([out.r[i], out.g[i], out.b[i]], `strength=${strength}`).toEqual([0, 0, 255])
    }
  })
})
