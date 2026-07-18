/**
 * Self-contained 2D FFT for the client-side L0 flatten (`l0-smooth.ts`).
 *
 * The server's L0 gradient minimisation (Xu et al. 2011) solves a linear system
 * in the frequency domain via numpy's `fft2`/`ifft2`. To reproduce it in the
 * browser we need a matching complex 2D FFT — there is no FFT dependency in the
 * repo, so this is a small iterative radix-2 Cooley–Tukey with the input padded
 * to the next power of two. Not tuned for raw speed (the L0 driver runs it off
 * the main thread in a Web Worker); correctness + numpy-matching conventions are
 * what matter. Unit-tested against a naive O(n²) DFT and a round-trip identity.
 */

/** Smallest power of two ≥ n. */
export function nextPow2(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

/**
 * In-place FFT of a complex vector (`re`, `im` same length). `inverse` runs the
 * conjugated transform WITHOUT the 1/N scaling — callers scale once after the 2D
 * inverse (matches how a separable 2D inverse divides by N·M total). Dispatches
 * to radix-2 for power-of-two lengths and Bluestein for arbitrary lengths, so a
 * non-power-of-two image dimension transforms EXACTLY like numpy's `fft` (no
 * zero-padding of the image → the circular domain matches the server's L0).
 */
export function fft1d(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length
  if (n <= 1) return
  if ((n & (n - 1)) === 0) {
    fft1dRadix2(re, im, inverse)
  } else if (isSmooth(n)) {
    fft1dMixed(re, im, inverse)
  } else {
    fft1dBluestein(re, im, inverse)
  }
}

/** Smallest prime factor of n (n ≥ 2). */
function smallestPrimeFactor(n: number): number {
  if (n % 2 === 0) return 2
  for (let p = 3; p * p <= n; p += 2) if (n % p === 0) return p
  return n
}

/** True when n factors entirely into {2,3,5,7} — mixed-radix is efficient + exact. */
function isSmooth(n: number): boolean {
  let m = n
  for (const p of [2, 3, 5, 7]) while (m % p === 0) m /= p
  return m === 1
}

// Twiddle cache: cos/sin of 2π·m/n for m=0..n-1, per size n. The L0 driver runs
// ~130 FFTs of the SAME handful of sizes, so this turns millions of Math.cos/sin
// calls into a one-time table per size. Forward W_n^m = exp(-iθ) = (cos, -sin);
// inverse = conjugate = (cos, +sin).
const trigCache = new Map<number, { cos: Float64Array; sin: Float64Array }>()
function trigTable(n: number): { cos: Float64Array; sin: Float64Array } {
  let t = trigCache.get(n)
  if (t === undefined) {
    const cos = new Float64Array(n)
    const sin = new Float64Array(n)
    for (let m = 0; m < n; m += 1) {
      const ang = (2 * Math.PI * m) / n
      cos[m] = Math.cos(ang)
      sin[m] = Math.sin(ang)
    }
    t = { cos, sin }
    trigCache.set(n, t)
  }
  return t
}

/** Direct O(n²) DFT — base case for a (small) prime factor. Unscaled, matching fft1dRadix2. */
function dftDirect(re: Float64Array, im: Float64Array, inverse: boolean): { re: Float64Array; im: Float64Array } {
  const n = re.length
  const outRe = new Float64Array(n)
  const outIm = new Float64Array(n)
  const { cos, sin } = trigTable(n)
  for (let k = 0; k < n; k += 1) {
    let sr = 0
    let si = 0
    for (let t = 0; t < n; t += 1) {
      const idx = (k * t) % n
      const c = cos[idx]
      const s = inverse ? sin[idx] : -sin[idx]
      sr += re[t] * c - im[t] * s
      si += re[t] * s + im[t] * c
    }
    outRe[k] = sr
    outIm[k] = si
  }
  return { re: outRe, im: outIm }
}

/**
 * Mixed-radix (decimation-in-time) FFT for smooth lengths, written in-place onto
 * `re`/`im`. At each level it pulls out the smallest prime factor p, FFTs the p
 * stride-p subsequences, then combines: X[k] = Σ_j W_n^{jk} · Y_j[k mod q].
 * Same unscaled convention as fft1dRadix2 — EXACT (no padding, matches numpy).
 */
function fft1dMixed(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const out = mixedRec(re, im, inverse)
  re.set(out.re)
  im.set(out.im)
}

function mixedRec(re: Float64Array, im: Float64Array, inverse: boolean): { re: Float64Array; im: Float64Array } {
  const n = re.length
  if (n === 1) return { re: Float64Array.from(re), im: Float64Array.from(im) }
  const p = smallestPrimeFactor(n)
  if (p === n) return dftDirect(re, im, inverse)
  const q = n / p

  const subRe: Float64Array[] = new Array(p)
  const subIm: Float64Array[] = new Array(p)
  for (let j = 0; j < p; j += 1) {
    const sr = new Float64Array(q)
    const si = new Float64Array(q)
    for (let k = 0; k < q; k += 1) {
      sr[k] = re[k * p + j]
      si[k] = im[k * p + j]
    }
    const sub = mixedRec(sr, si, inverse)
    subRe[j] = sub.re
    subIm[j] = sub.im
  }

  const { cos, sin } = trigTable(n)
  const outRe = new Float64Array(n)
  const outIm = new Float64Array(n)
  for (let k = 0; k < n; k += 1) {
    const kq = k % q
    let accRe = 0
    let accIm = 0
    for (let j = 0; j < p; j += 1) {
      const idx = (j * k) % n
      const wRe = cos[idx]
      const wIm = inverse ? sin[idx] : -sin[idx]
      const yr = subRe[j][kq]
      const yi = subIm[j][kq]
      accRe += wRe * yr - wIm * yi
      accIm += wRe * yi + wIm * yr
    }
    outRe[k] = accRe
    outIm[k] = accIm
  }
  return { re: outRe, im: outIm }
}

/** In-place iterative radix-2 FFT (length MUST be a power of two). */
function fft1dRadix2(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length
  if (n <= 1) return

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]
      re[i] = re[j]
      re[j] = tr
      const ti = im[i]
      im[i] = im[j]
      im[j] = ti
    }
  }

  const sign = inverse ? 1 : -1
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * 2 * Math.PI) / len
    const wRe = Math.cos(ang)
    const wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curRe = 1
      let curIm = 0
      const half = len >> 1
      for (let k = 0; k < half; k += 1) {
        const a = i + k
        const b = a + half
        const bRe = re[b] * curRe - im[b] * curIm
        const bIm = re[b] * curIm + im[b] * curRe
        re[b] = re[a] - bRe
        im[b] = im[a] - bIm
        re[a] += bRe
        im[a] += bIm
        const nextRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nextRe
      }
    }
  }
}

/**
 * In-place FFT for an arbitrary length via Bluestein's chirp-z transform: the
 * DFT is rewritten as a convolution of length `nextPow2(2n-1)` evaluated with
 * the radix-2 FFT. Same (unscaled) convention as `fft1dRadix2`.
 */
function fft1dBluestein(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length
  const s = inverse ? 1 : -1
  const cosT = new Float64Array(n)
  const sinT = new Float64Array(n)
  for (let k = 0; k < n; k += 1) {
    // (k*k mod 2n) keeps the angle small for precision at large n.
    const j = (k * k) % (2 * n)
    const ang = (s * Math.PI * j) / n
    cosT[k] = Math.cos(ang)
    sinT[k] = Math.sin(ang)
  }
  const m = nextPow2(2 * n - 1)
  const aRe = new Float64Array(m)
  const aIm = new Float64Array(m)
  for (let k = 0; k < n; k += 1) {
    aRe[k] = re[k] * cosT[k] - im[k] * sinT[k]
    aIm[k] = re[k] * sinT[k] + im[k] * cosT[k]
  }
  const bRe = new Float64Array(m)
  const bIm = new Float64Array(m)
  bRe[0] = cosT[0]
  bIm[0] = -sinT[0]
  for (let k = 1; k < n; k += 1) {
    bRe[k] = cosT[k]
    bIm[k] = -sinT[k]
    bRe[m - k] = cosT[k]
    bIm[m - k] = -sinT[k]
  }
  fft1dRadix2(aRe, aIm, false)
  fft1dRadix2(bRe, bIm, false)
  for (let k = 0; k < m; k += 1) {
    const tr = aRe[k] * bRe[k] - aIm[k] * bIm[k]
    aIm[k] = aRe[k] * bIm[k] + aIm[k] * bRe[k]
    aRe[k] = tr
  }
  fft1dRadix2(aRe, aIm, true)
  for (let k = 0; k < n; k += 1) {
    const cr = aRe[k] / m
    const ci = aIm[k] / m
    re[k] = cr * cosT[k] - ci * sinT[k]
    im[k] = cr * sinT[k] + ci * cosT[k]
  }
}

export type Complex2D = {
  re: Float64Array
  im: Float64Array
  width: number
  height: number
}

/**
 * Forward 2D FFT of a real plane (row-major, `height*width`). Returns complex
 * arrays of the same dimensions. `width`/`height` may be ANY size (Bluestein
 * handles non-power-of-two), matching numpy's `fft2` on the raw image. Separable:
 * FFT every row, then every column.
 */
export function fft2Real(plane: Float64Array | number[], width: number, height: number): Complex2D {
  const re = new Float64Array(width * height)
  const im = new Float64Array(width * height)
  re.set(plane)
  fft2InPlace(re, im, width, height, false)
  return { re, im, width, height }
}

/** Inverse 2D FFT; returns the real part (row-major), scaled by 1/(width·height). */
export function ifft2Real(data: Complex2D): Float64Array {
  const { width, height } = data
  const re = data.re.slice()
  const im = data.im.slice()
  fft2InPlace(re, im, width, height, true)
  const n = width * height
  const out = new Float64Array(n)
  for (let i = 0; i < n; i += 1) out[i] = re[i] / n
  return out
}

/** Separable in-place 2D transform (rows then columns) on complex planes. */
function fft2InPlace(re: Float64Array, im: Float64Array, width: number, height: number, inverse: boolean): void {
  const rowRe = new Float64Array(width)
  const rowIm = new Float64Array(width)
  for (let y = 0; y < height; y += 1) {
    const off = y * width
    rowRe.set(re.subarray(off, off + width))
    rowIm.set(im.subarray(off, off + width))
    fft1d(rowRe, rowIm, inverse)
    re.set(rowRe, off)
    im.set(rowIm, off)
  }
  const colRe = new Float64Array(height)
  const colIm = new Float64Array(height)
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      colRe[y] = re[y * width + x]
      colIm[y] = im[y * width + x]
    }
    fft1d(colRe, colIm, inverse)
    for (let y = 0; y < height; y += 1) {
      re[y * width + x] = colRe[y]
      im[y * width + x] = colIm[y]
    }
  }
}
