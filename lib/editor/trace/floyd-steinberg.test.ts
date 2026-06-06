/**
 * Floyd-Steinberg parity test (client side). The SAME constructed
 * test cases are asserted in the Python mirror
 * `filter-service/tests/test_floyd_steinberg.py` — algorithmic drift
 * fails on both sides.
 *
 * Reference: Floyd & Steinberg (1976), "An Adaptive Algorithm for
 * Spatial Greyscale," Proc SID 17/2.
 */
import { describe, expect, it } from "vitest"

import { floydSteinbergDither } from "./floyd-steinberg"

/** Build flat cells from `cell[y][x] = [d0, d1, ...]` for readable tests. */
function flatten3D(cells: ReadonlyArray<ReadonlyArray<ReadonlyArray<number>>>): {
  data: number[]
  H: number
  W: number
  dim: number
} {
  const H = cells.length
  const W = cells[0].length
  const dim = cells[0][0].length
  const data: number[] = []
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      for (let d = 0; d < dim; d += 1) data.push(cells[y][x][d])
    }
  }
  return { data, H, W, dim }
}

/** Build flat palette from `palette[i] = [d0, d1, ...]`. */
function flatPalette(palette: ReadonlyArray<ReadonlyArray<number>>): {
  data: number[]
  M: number
  dim: number
} {
  const M = palette.length
  const dim = palette[0].length
  const data: number[] = []
  for (let i = 0; i < M; i += 1) {
    for (let d = 0; d < dim; d += 1) data.push(palette[i][d])
  }
  return { data, M, dim }
}

describe("floydSteinbergDither — error-diffusion (server parity)", () => {
  it("identity: cells already on palette chip → uniform output indices", () => {
    const palette = flatPalette([[0, 0, 0], [0.5, 0.5, 0.5], [1, 1, 1]])
    // 4×4 grid filled with palette chip 1.
    const cells = flatten3D(
      Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => [0.5, 0.5, 0.5])),
    )
    const out = floydSteinbergDither(cells.data, cells.H, cells.W, palette.data, palette.M, palette.dim)
    expect(out.length).toBe(16)
    for (let i = 0; i < out.length; i += 1) expect(out[i]).toBe(1)
  })

  it("1×1 grid degenerates to plain nearest-neighbour", () => {
    const palette = flatPalette([[0, 0, 0], [0.2, 0.2, 0.2], [0.5, 0.5, 0.5], [0.8, 0.8, 0.8], [1, 1, 1]])
    const probes: Array<[number, number, number]> = [
      [0.05, 0.05, 0.05],
      [0.45, 0.45, 0.45],
      [0.95, 0.95, 0.95],
    ]
    for (const target of probes) {
      const cells = flatten3D([[target]])
      const out = floydSteinbergDither(cells.data, 1, 1, palette.data, palette.M, palette.dim)
      // Expected: argmin over palette rows.
      let bestJ = 0
      let bestD = Infinity
      for (let j = 0; j < palette.M; j += 1) {
        const pBase = j * 3
        let s = 0
        for (let d = 0; d < 3; d += 1) {
          const diff = palette.data[pBase + d] - target[d]
          s += diff * diff
        }
        if (s < bestD) {
          bestD = s
          bestJ = j
        }
      }
      expect(out[0]).toBe(bestJ)
    }
  })

  it("mid-gray on {black, white} dithers roughly half-and-half on an 8×8 grid", () => {
    const palette = flatPalette([[0], [1]])
    const cells = flatten3D(
      Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => [0.5])),
    )
    const out = floydSteinbergDither(cells.data, cells.H, cells.W, palette.data, palette.M, palette.dim)
    let nBlack = 0
    let nWhite = 0
    for (let i = 0; i < out.length; i += 1) {
      if (out[i] === 0) nBlack += 1
      else if (out[i] === 1) nWhite += 1
    }
    expect(nBlack + nWhite).toBe(64)
    // 50/50 ± 15%.
    expect(nBlack).toBeGreaterThanOrEqual(22)
    expect(nBlack).toBeLessThanOrEqual(42)
    expect(nWhite).toBeGreaterThanOrEqual(22)
    expect(nWhite).toBeLessThanOrEqual(42)
  })

  it("(0, 0) cell uses plain nearest-neighbour (no incoming error)", () => {
    const palette = flatPalette([[0, 0, 0], [0.4, 0.4, 0.4], [1, 1, 1]])
    // 5×5 grid: top-left is dark off-axis, rest is mid-gray.
    const cellsRaw: number[][][] = []
    for (let y = 0; y < 5; y += 1) {
      const row: number[][] = []
      for (let x = 0; x < 5; x += 1) row.push([0.4, 0.4, 0.4])
      cellsRaw.push(row)
    }
    cellsRaw[0][0] = [0.1, 0.05, 0.05]
    const cells = flatten3D(cellsRaw)
    const out = floydSteinbergDither(cells.data, cells.H, cells.W, palette.data, palette.M, palette.dim)
    // Expected first-cell index: argmin over palette for the (0,0) target.
    const target = [0.1, 0.05, 0.05]
    let bestJ = 0
    let bestD = Infinity
    for (let j = 0; j < palette.M; j += 1) {
      const pBase = j * 3
      let s = 0
      for (let d = 0; d < 3; d += 1) {
        const diff = palette.data[pBase + d] - target[d]
        s += diff * diff
      }
      if (s < bestD) {
        bestD = s
        bestJ = j
      }
    }
    expect(out[0]).toBe(bestJ)
  })

  it("is deterministic across repeated calls", () => {
    // Constructed (non-random) input so TS + Python parity is byte-exact.
    const palette = flatPalette([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
      [0.7, 0.8, 0.9],
      [0.05, 0.95, 0.5],
    ])
    const cellsRaw: number[][][] = []
    for (let y = 0; y < 12; y += 1) {
      const row: number[][] = []
      for (let x = 0; x < 14; x += 1) {
        row.push([(x * 13) % 100 / 100, (y * 17) % 100 / 100, ((x + y) * 7) % 100 / 100])
      }
      cellsRaw.push(row)
    }
    const cells = flatten3D(cellsRaw)
    const first = floydSteinbergDither(cells.data, cells.H, cells.W, palette.data, palette.M, palette.dim)
    for (let _ = 0; _ < 5; _ += 1) {
      const out = floydSteinbergDither(cells.data, cells.H, cells.W, palette.data, palette.M, palette.dim)
      expect(Array.from(out)).toEqual(Array.from(first))
    }
  })

  it("output indices are always in [0, paletteSize)", () => {
    const palette = flatPalette([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
      [0.7, 0.8, 0.9],
    ])
    const cellsRaw: number[][][] = []
    for (let y = 0; y < 6; y += 1) {
      const row: number[][] = []
      for (let x = 0; x < 7; x += 1) {
        row.push([(x * 11) % 100 / 100, (y * 23) % 100 / 100, ((x + y) * 31) % 100 / 100])
      }
      cellsRaw.push(row)
    }
    const cells = flatten3D(cellsRaw)
    const out = floydSteinbergDither(cells.data, cells.H, cells.W, palette.data, palette.M, palette.dim)
    let minIdx = Infinity
    let maxIdx = -Infinity
    for (let i = 0; i < out.length; i += 1) {
      if (out[i] < minIdx) minIdx = out[i]
      if (out[i] > maxIdx) maxIdx = out[i]
    }
    expect(minIdx).toBeGreaterThanOrEqual(0)
    expect(maxIdx).toBeLessThan(palette.M)
  })

  it("smooth gradient uses ≥ 3 distinct chips on a 5-chip palette", () => {
    const palette = flatPalette([[0], [0.25], [0.5], [0.75], [1]])
    const cellsRaw: number[][][] = []
    for (let y = 0; y < 8; y += 1) {
      const row: number[][] = []
      for (let x = 0; x < 20; x += 1) {
        row.push([x / 19])
      }
      cellsRaw.push(row)
    }
    const cells = flatten3D(cellsRaw)
    const out = floydSteinbergDither(cells.data, cells.H, cells.W, palette.data, palette.M, palette.dim)
    const distinct = new Set(Array.from(out)).size
    expect(distinct).toBeGreaterThanOrEqual(3)
  })

  it("rejects misshapen inputs", () => {
    const palette = flatPalette([[0, 0, 0], [1, 1, 1]])
    // Wrong cells length.
    expect(() =>
      floydSteinbergDither([0, 0, 0], 2, 2, palette.data, palette.M, palette.dim),
    ).toThrow()
    // Wrong palette length.
    expect(() =>
      floydSteinbergDither(
        Array(12).fill(0),
        2,
        2,
        [0, 0],
        palette.M,
        palette.dim,
      ),
    ).toThrow()
    // Bad H / W.
    expect(() =>
      floydSteinbergDither([], 0, 0, palette.data, palette.M, palette.dim),
    ).toThrow()
  })

  it("explicit 3×3 trace pins down the FS kernel + scan order", () => {
    // Same trace as the Python sister test: palette {0, 1}, uniform
    // 0.5 target. First row must be [0, 1, 0] given argmin's lowest-
    // index tie-breaking convention. See test_floyd_steinberg.py for
    // the step-by-step error propagation derivation.
    const palette = flatPalette([[0], [1]])
    const cells = flatten3D(
      Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => [0.5])),
    )
    const out = floydSteinbergDither(cells.data, 3, 3, palette.data, palette.M, palette.dim)
    expect([out[0], out[1], out[2]]).toEqual([0, 1, 0])
  })
})
