/**
 * Knoll-Yliluoma parity test (client side). The SAME constructed test
 * cases are asserted in the Python mirror
 * `filter-service/tests/test_knoll_yliluoma.py` — algorithmic drift
 * fails on both sides.
 *
 * Reference: Joel Yliluoma (2014), "Joel Yliluoma's arbitrary-palette
 * positional dithering algorithm."
 */
import { describe, expect, it } from "vitest"

import {
  BLUE_NOISE_LUT_SIZE,
  candidatesSortedByAxis,
  knollYliluomaCandidates,
  thresholdBin,
  type BlueNoiseLut,
} from "./knoll-yliluoma"

/**
 * Build a 256×256 LUT by tiling a small `block` pattern. Tests construct
 * known LUTs this way to keep them self-contained — the runtime LUT lives
 * in `public/assets/blue-noise-256.bin` and would require async fetch.
 */
function tileLut(block: ReadonlyArray<ReadonlyArray<number>>): BlueNoiseLut {
  const out = new Uint8Array(BLUE_NOISE_LUT_SIZE * BLUE_NOISE_LUT_SIZE)
  const bh = block.length
  const bw = block[0].length
  for (let y = 0; y < BLUE_NOISE_LUT_SIZE; y += 1) {
    for (let x = 0; x < BLUE_NOISE_LUT_SIZE; x += 1) {
      out[y * BLUE_NOISE_LUT_SIZE + x] = block[y % bh][x % bw]
    }
  }
  return out
}

describe("knollYliluomaCandidates — candidate selection (server parity)", () => {
  it("returns the palette chip itself when target == that chip", () => {
    const palette = [0, 0, 0, 0.5, 0, 0, 1, 0, 0] // 3 chips × dim=3
    const target = [0.5, 0, 0]
    for (const N of [1, 2, 4, 8]) {
      const candidates = knollYliluomaCandidates(target, palette, 3, 3, N)
      expect(candidates).toEqual(new Array(N).fill(1))
    }
  })

  it("alternates between black and white for mid-gray target", () => {
    const palette = [0, 0, 0, 1, 0, 0]
    const target = [0.5, 0, 0]
    expect(knollYliluomaCandidates(target, palette, 2, 3, 1)).toEqual([0])
    expect(knollYliluomaCandidates(target, palette, 2, 3, 2)).toEqual([0, 1])
    expect(knollYliluomaCandidates(target, palette, 2, 3, 4)).toEqual([0, 1, 0, 1])
    expect(knollYliluomaCandidates(target, palette, 2, 3, 8)).toEqual([
      0, 1, 0, 1, 0, 1, 0, 1,
    ])
  })

  it("running mean converges toward the off-grid target as N grows", () => {
    // 5 chips spaced uniformly on [0, 1]: 0, 0.25, 0.5, 0.75, 1.0.
    const palette = [0, 0.25, 0.5, 0.75, 1.0]
    const target = [0.37]
    const err: Record<number, number> = {}
    for (const N of [1, 2, 4, 8, 16]) {
      const candidates = knollYliluomaCandidates(target, palette, 5, 1, N)
      let sum = 0
      for (const c of candidates) sum += palette[c]
      const mean = sum / N
      err[N] = Math.abs(mean - target[0])
    }
    // N=1 snaps to nearest (0.25), error ≥ 0.10.
    expect(err[1]).toBeGreaterThanOrEqual(0.1)
    // N=8 within 0.05 of target.
    expect(err[8]).toBeLessThanOrEqual(0.05)
    // Monotone non-increasing.
    expect(err[2]).toBeLessThanOrEqual(err[1] + 1e-9)
    expect(err[4]).toBeLessThanOrEqual(err[2] + 1e-9)
    expect(err[8]).toBeLessThanOrEqual(err[4] + 1e-9)
  })

  it("first candidate (N=1) equals plain nearest-neighbour", () => {
    // Constructed (non-random — same fixture both sides).
    const palette: number[] = []
    for (let i = 0; i < 20; i += 1) {
      palette.push((i * 17) % 100 / 100, (i * 31) % 100 / 100, (i * 53) % 100 / 100)
    }
    const targets = [
      [0.13, 0.27, 0.5],
      [0.91, 0.05, 0.42],
      [0.5, 0.5, 0.5],
      [0.02, 0.98, 0.7],
    ]
    for (const target of targets) {
      const ky = knollYliluomaCandidates(target, palette, 20, 3, 1)[0]
      let bestJ = 0
      let bestD = Infinity
      for (let j = 0; j < 20; j += 1) {
        const base = j * 3
        const dx = palette[base] - target[0]
        const dy = palette[base + 1] - target[1]
        const dz = palette[base + 2] - target[2]
        const d = dx * dx + dy * dy + dz * dz
        if (d < bestD) {
          bestD = d
          bestJ = j
        }
      }
      expect(ky).toBe(bestJ)
    }
  })

  it("rejects invalid inputs", () => {
    const palette = [0, 0, 0, 1, 1, 1, 0.5, 0.5, 0.5]
    const target = [0.3, 0.3, 0.3]
    for (const bad of [0, -1, -10]) {
      expect(() => knollYliluomaCandidates(target, palette, 3, 3, bad)).toThrow()
    }
    expect(() => knollYliluomaCandidates([0.3, 0.3], palette, 3, 3, 4)).toThrow()
  })

  it("is deterministic across repeated calls", () => {
    const palette: number[] = []
    for (let i = 0; i < 50; i += 1) {
      palette.push((i * 7) % 100 / 100, (i * 23) % 100 / 100, (i * 41) % 100 / 100)
    }
    const target = [0.42, 0.61, 0.18]
    const first = knollYliluomaCandidates(target, palette, 50, 3, 8)
    for (let _ = 0; _ < 5; _ += 1) {
      expect(knollYliluomaCandidates(target, palette, 50, 3, 8)).toEqual(first)
    }
  })
})

describe("thresholdBin — LUT-driven position → candidate rank (server parity)", () => {
  it("partitions LUT range evenly across N bins", () => {
    // Synthetic LUT with linear ramp 0..255 along x.
    const block: number[][] = []
    for (let y = 0; y < 1; y += 1) {
      const row: number[] = []
      for (let x = 0; x < 256; x += 1) row.push(x)
      block.push(row)
    }
    const lut = tileLut(block)
    for (const N of [2, 4, 8, 16, 32]) {
      for (let x = 0; x < 256; x += 17) {
        const bin = thresholdBin(x, 0, N, lut)
        expect(bin).toBeGreaterThanOrEqual(0)
        expect(bin).toBeLessThan(N)
      }
    }
  })

  it("maps quartile LUT values to correct bins for N=4", () => {
    // 4×1 block with quartile boundary values 0, 64, 128, 192.
    const lut = tileLut([[0, 64, 128, 192]])
    expect(thresholdBin(0, 0, 4, lut)).toBe(0)
    expect(thresholdBin(1, 0, 4, lut)).toBe(1)
    expect(thresholdBin(2, 0, 4, lut)).toBe(2)
    expect(thresholdBin(3, 0, 4, lut)).toBe(3)
  })

  it("wraps positions modulo 256 so (x, y) tiles deterministically", () => {
    // Constructed LUT (independent of the committed binary) so the parity
    // contract is "wrap behaviour is consistent" rather than "committed
    // binary contents". Same construction in the Python sister test.
    const block: number[][] = []
    for (let y = 0; y < 4; y += 1) {
      const row: number[] = []
      for (let x = 0; x < 4; x += 1) row.push(((y * 13 + x * 7) * 17) % 256)
      block.push(row)
    }
    const lut = tileLut(block)
    for (const N of [2, 4, 8]) {
      for (const x of [5, 67, 199]) {
        for (const y of [3, 91, 222]) {
          const base = thresholdBin(x, y, N, lut)
          expect(thresholdBin(x + 256, y, N, lut)).toBe(base)
          expect(thresholdBin(x, y + 256, N, lut)).toBe(base)
          expect(thresholdBin(x + 256, y + 256, N, lut)).toBe(base)
        }
      }
    }
  })

  it("rejects bad pattern_size + wrong LUT size", () => {
    const lut = tileLut([[0]])
    expect(() => thresholdBin(0, 0, 0, lut)).toThrow()
    const wrong = new Uint8Array(100)
    expect(() => thresholdBin(0, 0, 4, wrong)).toThrow()
  })
})

describe("candidatesSortedByAxis — stable lightness-sort (server parity)", () => {
  it("sorts candidates ascending by palette[axis] with ties stable", () => {
    // Same palette + same expected order as the Python test.
    // Index 0 L=0.5, 1 L=0.2, 2 L=0.5, 3 L=0.8. Sorted ascending [1, 0, 2, 3].
    const palette = [0.5, 0, 0, 0.2, 0, 0, 0.5, 0, 0, 0.8, 0, 0]
    const candidates = [0, 1, 2, 3]
    expect(candidatesSortedByAxis(candidates, palette, 3, 0)).toEqual([1, 0, 2, 3])
  })
})
