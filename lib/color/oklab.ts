/**
 * OKLab color conversion + nearest-palette match — client side.
 *
 * Mirror of `filter-service/app/oklab.py` (and color-lab's `rgb_to_oklab`,
 * which computed the `lab_munsell` / `lab_grays` OKLab columns in the DB).
 * The matrices + gamma are byte-identical so a cell's OKLab lives in the
 * same space as the palette chips it is matched against. Transform per
 * Björn Ottosson (2020).
 *
 * Used by the trace live-preview (`trace-cell-colors.ts`); an algorithm
 * parity test (`oklab.test.ts` + `test_oklab.py`) keeps client and server
 * in lockstep against shared reference vectors.
 */

/** OKLab triple `[L, a, b]`. */
export type Oklab = readonly [number, number, number]

// Forward matrices (Ottosson), identical to the Python/color-lab source.
const M1 = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
] as const
const M2 = [
  [0.2104542553, 0.7936177850, -0.0040720468],
  [1.9779984951, -2.4285922050, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.8086757660],
] as const

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((Math.max(c, 0) + 0.055) / 1.055) ** 2.4
}

/**
 * sRGB (gamma-encoded, 0..255) → OKLab. Matches the server byte-for-byte
 * (same matrices, same gamma, `Math.cbrt`).
 */
export function rgb255ToOklab(r: number, g: number, b: number): Oklab {
  const lr = srgbToLinear(r / 255)
  const lg = srgbToLinear(g / 255)
  const lb = srgbToLinear(b / 255)
  const l = Math.cbrt(M1[0][0] * lr + M1[0][1] * lg + M1[0][2] * lb)
  const m = Math.cbrt(M1[1][0] * lr + M1[1][1] * lg + M1[1][2] * lb)
  const s = Math.cbrt(M1[2][0] * lr + M1[2][1] * lg + M1[2][2] * lb)
  return [
    M2[0][0] * l + M2[0][1] * m + M2[0][2] * s,
    M2[1][0] * l + M2[1][1] * m + M2[1][2] * s,
    M2[2][0] * l + M2[2][1] * m + M2[2][2] * s,
  ]
}

/**
 * Rotate the hue of an OKLab colour by `degrees` (OKLCh hue rotation),
 * keeping lightness L and chroma constant. Mirror of `oklab.py`'s
 * `rotate_hue`; used by Circulate's inner ellipse (the cell mean's hue is
 * shifted, then snapped back to the nearest palette chip so it never leaves
 * the palette). `degrees === 0` is the identity.
 */
export function rotateHueOklab(lab: Oklab, degrees: number): Oklab {
  const a = lab[1]
  const b = lab[2]
  const chroma = Math.hypot(a, b)
  const hue = Math.atan2(b, a) + (degrees * Math.PI) / 180
  return [lab[0], chroma * Math.cos(hue), chroma * Math.sin(hue)]
}

/**
 * Index of the nearest palette chip to `lab` by squared euclidean OKLab
 * distance. `palette` must be non-empty; returns 0 for an empty palette.
 */
export function nearestPaletteIndex(lab: Oklab, palette: readonly Oklab[]): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < palette.length; i += 1) {
    const p = palette[i]
    const dl = lab[0] - p[0]
    const da = lab[1] - p[1]
    const db = lab[2] - p[2]
    const d = dl * dl + da * da + db * db
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}
