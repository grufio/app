/**
 * Unique, human-readable per-chip names from the curated `color-name-list`
 * (~31.9k names, MIT). Build-time only — used by build-lab-munsell-seed.mjs to
 * give every `lab_munsell` chip a distinct `color_name` (replacing the old
 * coarse ISCC-NBS bucket names, which collided across 512 chips).
 *
 * Method: convert each name's hex to OKLab (the product's matching metric),
 * then assign each chip — in palette_index order — its NEAREST as-yet-unused
 * name. Nearest alone does not guarantee uniqueness (two chips can share a
 * nearest name), so "nearest unused" + a deterministic tie-break (lowest list
 * index) yields N distinct, reproducible names. ~32k names for 512 chips makes
 * collisions trivial to resolve.
 *
 * `lab_grays` are NOT named here — they get "System Gray NN" in SQL (a curated
 * list has nowhere near 48 distinct true neutrals).
 */
import { colornames } from "color-name-list"

function hexToRgb(hex) {
  const h = hex.replace("#", "")
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function srgbToLinear(c) {
  const x = c / 255
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}

/** sRGB 0..255 → OKLab [L,a,b]. Mirrors lib/color/oklab.ts + build_palette.py. */
export function rgbToOklab(r, g, b) {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b)
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s)
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ]
}

// Precompute the name palette once (OKLab per name), in stable list order.
const NAME_OKLAB = colornames.map((c) => ({ name: c.name, ok: rgbToOklab(...hexToRgb(c.hex)) }))

/**
 * Assign a unique name to each chip. `chips` must carry `.oklab` ([L,a,b]) and
 * be in the order names should be claimed (palette_index 0..N-1). Returns an
 * array of names aligned to `chips`; every entry is distinct. Throws if there
 * are more chips than names.
 */
export function assignChromaticNames(chips) {
  if (chips.length > NAME_OKLAB.length) {
    throw new Error(`more chips (${chips.length}) than names (${NAME_OKLAB.length})`)
  }
  const used = new Uint8Array(NAME_OKLAB.length)
  const out = []
  for (const chip of chips) {
    const [L, a, b] = chip.oklab
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < NAME_OKLAB.length; i += 1) {
      if (used[i]) continue
      const o = NAME_OKLAB[i].ok
      const d = (L - o[0]) ** 2 + (a - o[1]) ** 2 + (b - o[2]) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    used[best] = 1
    out.push(NAME_OKLAB[best].name)
  }
  return out
}
