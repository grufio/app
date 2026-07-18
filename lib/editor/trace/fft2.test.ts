import { describe, expect, it } from "vitest"

import { fft1d, fft2Real, ifft2Real, nextPow2 } from "./fft2"

// Naive O(n²) DFT reference (forward, no scaling) for cross-checking fft1d.
function naiveDft(re: number[], im: number[]): { re: number[]; im: number[] } {
  const n = re.length
  const outRe = new Array(n).fill(0)
  const outIm = new Array(n).fill(0)
  for (let k = 0; k < n; k += 1) {
    for (let t = 0; t < n; t += 1) {
      const ang = (-2 * Math.PI * k * t) / n
      const c = Math.cos(ang)
      const s = Math.sin(ang)
      outRe[k] += re[t] * c - im[t] * s
      outIm[k] += re[t] * s + im[t] * c
    }
  }
  return { re: outRe, im: outIm }
}

describe("nextPow2", () => {
  it("rounds up to the next power of two", () => {
    expect(nextPow2(1)).toBe(1)
    expect(nextPow2(3)).toBe(4)
    expect(nextPow2(384)).toBe(512)
    expect(nextPow2(512)).toBe(512)
  })
})

describe("fft1d", () => {
  it("matches a naive DFT on a random vector", () => {
    const n = 16
    const re = Array.from({ length: n }, (_, i) => Math.sin(i) + i * 0.1)
    const im = Array.from({ length: n }, (_, i) => Math.cos(i * 0.7))
    const ref = naiveDft(re, im)
    const fRe = Float64Array.from(re)
    const fIm = Float64Array.from(im)
    fft1d(fRe, fIm, false)
    for (let k = 0; k < n; k += 1) {
      expect(fRe[k]).toBeCloseTo(ref.re[k], 8)
      expect(fIm[k]).toBeCloseTo(ref.im[k], 8)
    }
  })

  it("inverse ∘ forward is identity (with 1/n scaling)", () => {
    const n = 32
    const re = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 1.3) * 3)
    const im = new Float64Array(n)
    const re0 = re.slice()
    fft1d(re, im, false)
    fft1d(re, im, true)
    for (let i = 0; i < n; i += 1) expect(re[i] / n).toBeCloseTo(re0[i], 8)
  })

  it("matches a naive DFT for NON-power-of-two lengths (mixed-radix + Bluestein)", () => {
    // smooth (2·3·5·7) → mixed-radix path; 13 (prime), 22 (=2·11) → Bluestein path.
    for (const n of [3, 6, 12, 24, 100, 480, 720, 13, 22]) {
      const re = Array.from({ length: n }, (_, i) => Math.sin(i * 0.9) + i * 0.05)
      const im = Array.from({ length: n }, (_, i) => Math.cos(i * 0.3) - 1)
      const ref = naiveDft(re, im)
      const fRe = Float64Array.from(re)
      const fIm = Float64Array.from(im)
      fft1d(fRe, fIm, false)
      for (let k = 0; k < n; k += 1) {
        expect(fRe[k]).toBeCloseTo(ref.re[k], 6)
        expect(fIm[k]).toBeCloseTo(ref.im[k], 6)
      }
    }
  })

  it("round-trips a non-power-of-two length", () => {
    const n = 24
    const re = Float64Array.from({ length: n }, (_, i) => (i % 7) - 3)
    const im = new Float64Array(n)
    const re0 = re.slice()
    fft1d(re, im, false)
    fft1d(re, im, true)
    for (let i = 0; i < n; i += 1) expect(re[i] / n).toBeCloseTo(re0[i], 8)
  })
})

describe("fft2Real / ifft2Real", () => {
  it("round-trips a real plane back to itself", () => {
    const w = 8
    const h = 4
    const plane = Float64Array.from({ length: w * h }, (_, i) => (i % 5) - 2 + Math.sin(i))
    const spec = fft2Real(plane, w, h)
    const back = ifft2Real(spec)
    for (let i = 0; i < plane.length; i += 1) expect(back[i]).toBeCloseTo(plane[i], 8)
  })

  it("DC term equals the sum of all samples", () => {
    const w = 4
    const h = 4
    const plane = Float64Array.from({ length: w * h }, () => 2)
    const spec = fft2Real(plane, w, h)
    // F[0,0] = Σ samples = 2 * 16 = 32 (imag ≈ 0).
    expect(spec.re[0]).toBeCloseTo(32, 8)
    expect(spec.im[0]).toBeCloseTo(0, 8)
  })

  it("round-trips a NON-power-of-two 2D plane (arbitrary image dims)", () => {
    const w = 12
    const h = 10
    const plane = Float64Array.from({ length: w * h }, (_, i) => Math.sin(i * 0.5) + (i % 3))
    const back = ifft2Real(fft2Real(plane, w, h))
    for (let i = 0; i < plane.length; i += 1) expect(back[i]).toBeCloseTo(plane[i], 7)
  })
})
