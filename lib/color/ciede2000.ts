/**
 * CIEDE2000 color-difference formula — client side.
 *
 * Mirror of `filter-service/app/ciede2000.py`. Same sRGB → linear → XYZ
 * (D65) → CIE Lab transform; same CIEDE2000 weighting + rotation;
 * byte-equivalent to the server within float precision (asserted by the
 * 34 Sharma 2005 reference pairs in both `ciede2000.test.ts` and the
 * Python `test_ciede2000.py`).
 *
 * Compared to the OKLab squared-Euclidean distance (`oklab.ts`), CIEDE2000
 * explicitly corrects two known weaknesses of plain Euclidean Lab metrics:
 * lightness dominance (the `Sl` term flattens contrast in the mid-L range)
 * and hue rotation around the blue axis (the `Rt` rotation term). The
 * cost is ~30 extra operations per pair vs the OKLab squared-Euclidean
 * snap — still cheap enough for live cell-preview math.
 *
 * Reference: Sharma, Wu & Dalal (2005), "The CIEDE2000 Color-Difference
 * Formula: Implementation Notes, Supplementary Test Data, and Mathematical
 * Observations."
 *
 * This module is purely additive — no preview code wires it in yet. The
 * downstream PRs (palette restriction + dithering) choose which distance
 * metric to use; PR-B just provides the math + parity-tested broadcast
 * variant against the server.
 */

/** CIE Lab triple `[L, a, b]`. L in 0..100, a/b unbounded. */
export type CieLab = readonly [number, number, number]

// sRGB → linear sRGB → XYZ (D65 reference white). Matrices: Bruce
// Lindbloom (sRGB matrix, D65). Reference white per CIE 15:2004.
const SRGB_TO_XYZ_D65 = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.0721750],
  [0.0193339, 0.1191920, 0.9503041],
] as const
const D65_WHITE = [0.95047, 1.0, 1.08883] as const

// CIE Lab f(t): t**(1/3) above the linearity break, affine below.
const LAB_T0 = (6 / 29) ** 3
const LAB_KAPPA = (29 / 6) ** 2 / 3 // ≈ 7.787

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((Math.max(c, 0) + 0.055) / 1.055) ** 2.4
}

function labF(t: number): number {
  return t > LAB_T0 ? Math.cbrt(t) : LAB_KAPPA * t + 4 / 29
}

/**
 * sRGB (gamma-encoded, 0..255) → CIE Lab D65. Matches the server byte-
 * for-byte (same matrices, same gamma, same white point).
 */
export function rgb255ToCielab(r: number, g: number, b: number): CieLab {
  const lr = srgbToLinear(r / 255)
  const lg = srgbToLinear(g / 255)
  const lb = srgbToLinear(b / 255)
  const x = SRGB_TO_XYZ_D65[0][0] * lr + SRGB_TO_XYZ_D65[0][1] * lg + SRGB_TO_XYZ_D65[0][2] * lb
  const y = SRGB_TO_XYZ_D65[1][0] * lr + SRGB_TO_XYZ_D65[1][1] * lg + SRGB_TO_XYZ_D65[1][2] * lb
  const z = SRGB_TO_XYZ_D65[2][0] * lr + SRGB_TO_XYZ_D65[2][1] * lg + SRGB_TO_XYZ_D65[2][2] * lb
  const fx = labF(x / D65_WHITE[0])
  const fy = labF(y / D65_WHITE[1])
  const fz = labF(z / D65_WHITE[2])
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const DEG = 180 / Math.PI
const RAD = Math.PI / 180
const POW_25_7 = 25 ** 7

/**
 * CIE ΔE00 between two CIE Lab colours. Parametric factors `kL = kC =
 * kH = 1` (graphic-arts default).
 *
 * Symbolic naming follows Sharma 2005:
 *   - `cp1`, `cp2`            : "C prime", rotated chroma
 *   - `hp1`, `hp2`            : "h prime", hue in degrees [0, 360)
 *   - `dLp`, `dCp`, `dHp`     : the three difference terms
 *   - `Lbarp`, `Cbarp`, `Hbarp` : per-axis arithmetic means
 *   - `Sl`, `Sc`, `Sh`        : L/C/H weighting functions
 *   - `Rt`                    : rotation term coupling dCp and dHp
 *                               around the blue axis
 */
export function ciede2000(lab1: CieLab, lab2: CieLab): number {
  const [L1, a1, b1] = lab1
  const [L2, a2, b2] = lab2

  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cbar = 0.5 * (C1 + C2)
  const Cbar7 = Cbar ** 7
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW_25_7)))

  const ap1 = (1 + G) * a1
  const ap2 = (1 + G) * a2
  const cp1 = Math.hypot(ap1, b1)
  const cp2 = Math.hypot(ap2, b2)

  // Hue in degrees, wrapped to [0, 360). atan2 returns 0 when both args
  // are zero, which matches the Sharma convention (hp undefined → 0).
  const hp1 = ((Math.atan2(b1, ap1) * DEG) % 360 + 360) % 360
  const hp2 = ((Math.atan2(b2, ap2) * DEG) % 360 + 360) % 360

  const dLp = L2 - L1
  const dCp = cp2 - cp1

  const cpProdZero = cp1 * cp2 === 0
  let dh = hp2 - hp1
  if (dh > 180) dh -= 360
  else if (dh < -180) dh += 360
  const dhp = cpProdZero ? 0 : dh
  const dHp = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dhp / 2) * RAD)

  const Lbarp = 0.5 * (L1 + L2)
  const Cbarp = 0.5 * (cp1 + cp2)

  const hSum = hp1 + hp2
  let Hbarp: number
  if (cpProdZero) {
    Hbarp = hSum
  } else if (Math.abs(hp1 - hp2) <= 180) {
    Hbarp = hSum / 2
  } else if (hSum < 360) {
    Hbarp = (hSum + 360) / 2
  } else {
    Hbarp = (hSum - 360) / 2
  }

  const T =
    1 -
    0.17 * Math.cos((Hbarp - 30) * RAD) +
    0.24 * Math.cos(2 * Hbarp * RAD) +
    0.32 * Math.cos((3 * Hbarp + 6) * RAD) -
    0.2 * Math.cos((4 * Hbarp - 63) * RAD)

  const dTheta = 30 * Math.exp(-(((Hbarp - 275) / 25) ** 2))
  const Cbarp7 = Cbarp ** 7
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + POW_25_7))

  const L50sq = (Lbarp - 50) ** 2
  const Sl = 1 + (0.015 * L50sq) / Math.sqrt(20 + L50sq)
  const Sc = 1 + 0.045 * Cbarp
  const Sh = 1 + 0.015 * Cbarp * T
  const Rt = -Math.sin(2 * dTheta * RAD) * Rc

  const termL = dLp / Sl
  const termC = dCp / Sc
  const termH = dHp / Sh
  return Math.sqrt(termL ** 2 + termC ** 2 + termH ** 2 + Rt * termC * termH)
}

/**
 * Index of the nearest palette chip to `lab` by CIEDE2000 distance.
 * `palette` must be non-empty; returns 0 for an empty palette.
 *
 * Linear scan — palette size in practice is ≤ ~300 chips, so the
 * O(N·M) scan cost is dominated by per-pair CIEDE2000 evaluation
 * rather than algorithmic overhead.
 */
export function nearestPaletteIndexCiede2000(
  lab: CieLab,
  palette: readonly CieLab[],
): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < palette.length; i += 1) {
    const d = ciede2000(lab, palette[i])
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}
