/**
 * Client port of the server's L0 edge-preserving flatten
 * (`filter-service/app/linerate.py::_l0_smooth`, Xu et al. 2011) so the linerate
 * preview flattens texture the SAME way the Apply result does — a plain Gaussian
 * blur left texture standing and the segmentation over-split it into speckle.
 *
 * This mirrors the numpy version step for step (psf2otf derivative operators,
 * the geometric β schedule, the cross-channel gradient thresholding, the
 * frequency-domain solve). It is NOT bit-identical (JS float FFT ≠ numpy), but
 * removes texture and plateaus at the same region density.
 *
 * Heavy (several 2D FFTs per β iteration) — run OFF the main thread
 * (`linerate-preview.worker.ts`). It depends only on `flatten`, not `detail`.
 */
import { fft2Real, ifft2Real, type Complex2D } from "./fft2"
import type { PreviewImage } from "./lineart-preview"

/** Mirror of `_flatten_to_lam`: flatten ∈ [0,1] → L0 strength ~0.002..0.047. */
export function flattenToLam(flatten: number): number {
  const f = Math.max(0, Math.min(1, flatten))
  return 0.002 + f * 0.045
}

const KAPPA = 2.0
const BETA_MAX = 1e5

/** FFT of a `psf2otf`-placed small kernel (mirror of the numpy `psf2otf`). */
function psf2otf(kernel: number[][], w: number, h: number): Complex2D {
  const kh = kernel.length
  const kw = kernel[0].length
  const pad = new Float64Array(w * h)
  for (let y = 0; y < kh; y += 1) for (let x = 0; x < kw; x += 1) pad[y * w + x] = kernel[y][x]
  // np.roll by -(kh//2) rows, -(kw//2) cols (circular).
  const ry = -(kh >> 1)
  const rx = -(kw >> 1)
  const rolled = new Float64Array(w * h)
  for (let y = 0; y < h; y += 1) {
    const sy = ((y - ry) % h + h) % h
    for (let x = 0; x < w; x += 1) {
      const sx = ((x - rx) % w + w) % w
      rolled[y * w + x] = pad[sy * w + sx]
    }
  }
  return fft2Real(rolled, w, h)
}

/**
 * L0 gradient-minimisation flatten of an RGB image. Returns a new PreviewImage
 * (same dims) with texture removed and edges preserved.
 */
export function l0Smooth(image: PreviewImage, flatten: number): PreviewImage {
  const { width: w, height: h, rgba } = image
  const n = w * h
  const lam = flattenToLam(flatten)

  // Derivative OTFs + constant denominator term |otfx|² + |otfy|².
  const otfx = psf2otf([[1, -1]], w, h)
  const otfy = psf2otf([[1], [-1]], w, h)
  const den2 = new Float64Array(n)
  for (let i = 0; i < n; i += 1) {
    den2[i] = otfx.re[i] ** 2 + otfx.im[i] ** 2 + otfy.re[i] ** 2 + otfy.im[i] ** 2
  }

  // S = image / 255, per channel; Normin1 = fft2(S).
  const S: Float64Array[] = [new Float64Array(n), new Float64Array(n), new Float64Array(n)]
  for (let i = 0; i < n; i += 1) {
    const o = i * 4
    S[0][i] = rgba[o] / 255
    S[1][i] = rgba[o + 1] / 255
    S[2][i] = rgba[o + 2] / 255
  }
  const normin1: Complex2D[] = S.map((plane) => fft2Real(plane, w, h))

  const hCh: Float64Array[] = [new Float64Array(n), new Float64Array(n), new Float64Array(n)]
  const vCh: Float64Array[] = [new Float64Array(n), new Float64Array(n), new Float64Array(n)]
  const rhs = new Float64Array(n)

  for (let beta = 2 * lam; beta < BETA_MAX; beta *= KAPPA) {
    const thr = lam / beta

    // Forward-difference gradients with circular wrap (np.diff + wrap term).
    for (let c = 0; c < 3; c += 1) {
      const s = S[c]
      const hc = hCh[c]
      const vc = vCh[c]
      for (let y = 0; y < h; y += 1) {
        const row = y * w
        for (let x = 0; x < w; x += 1) {
          const i = row + x
          const xr = x + 1 < w ? i + 1 : row // wrap: last col uses col 0
          hc[i] = s[xr] - s[i]
          const yr = y + 1 < h ? i + w : x // wrap: last row uses row 0
          vc[i] = s[yr] - s[i]
        }
      }
    }

    // Cross-channel L0 threshold: zero gradients where Σ_c (h²+v²) < lam/β.
    for (let i = 0; i < n; i += 1) {
      let g = 0
      for (let c = 0; c < 3; c += 1) g += hCh[c][i] * hCh[c][i] + vCh[c][i] * vCh[c][i]
      if (g < thr) {
        for (let c = 0; c < 3; c += 1) {
          hCh[c][i] = 0
          vCh[c][i] = 0
        }
      }
    }

    // Solve each channel in the frequency domain and invert.
    for (let c = 0; c < 3; c += 1) {
      const hc = hCh[c]
      const vc = vCh[c]
      // Divergence of the thresholded gradients (backward diff with wrap).
      for (let y = 0; y < h; y += 1) {
        const row = y * w
        for (let x = 0; x < w; x += 1) {
          const i = row + x
          const xl = x - 1 >= 0 ? i - 1 : row + (w - 1) // wrap: col 0 uses last col
          const hd = x === 0 ? hc[row + (w - 1)] - hc[i] : hc[xl] - hc[i]
          const yl = y - 1 >= 0 ? i - w : (h - 1) * w + x // wrap: row 0 uses last row
          const vd = y === 0 ? vc[(h - 1) * w + x] - vc[i] : vc[yl] - vc[i]
          rhs[i] = hd + vd
        }
      }
      const rhsF = fft2Real(rhs, w, h)
      const nm = normin1[c]
      for (let i = 0; i < n; i += 1) {
        const den = 1 + beta * den2[i]
        rhsF.re[i] = (nm.re[i] + beta * rhsF.re[i]) / den
        rhsF.im[i] = (nm.im[i] + beta * rhsF.im[i]) / den
      }
      const real = ifft2Real(rhsF)
      S[c].set(real)
    }
  }

  const out = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i += 1) {
    const o = i * 4
    out[o] = Math.max(0, Math.min(1, S[0][i])) * 255
    out[o + 1] = Math.max(0, Math.min(1, S[1][i])) * 255
    out[o + 2] = Math.max(0, Math.min(1, S[2][i])) * 255
    out[o + 3] = 255
  }
  return { width: w, height: h, rgba: out }
}
