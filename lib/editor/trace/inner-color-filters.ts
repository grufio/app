/**
 * Pre-configured "sub colour filters" for Circulate's inner ellipse.
 *
 * Instead of raw sliders, the user picks one named filter. Each filter is a
 * fixed OKLab adjustment applied to the cell's (outer) colour; the result is
 * then snapped back to the palette so the inner colour never leaves it. This
 * is the SINGLE source of the presets — the schema enum, the form options, the
 * client preview, and the server handler all read from here, so a new filter
 * is added in one place (the server resolves the chosen filter to its
 * adjustment and passes that to the Python renderer; Python stays generic).
 *
 * Adjustment axes (OKLab): `hueDeg` rotates the hue, `lightnessDelta` shifts L
 * (0..1 scale — works on greys too, the only axis that does), `chromaScale`
 * scales the chroma. The defaults are tuned to land on a *different* palette
 * chip for typical cells; "darker" is the default so an enabled inner ellipse
 * is visibly distinct out of the box (incl. greys / b/w mode).
 */

/** An OKLab adjustment: hue rotation (deg), lightness shift (L, 0..1 units),
 * chroma scale (factor). Mirror in `filter-service/app/oklab.py::adjust_oklab`. */
export type OklabAdjustment = {
  hueDeg: number
  lightnessDelta: number
  chromaScale: number
}

const IDENTITY: OklabAdjustment = { hueDeg: 0, lightnessDelta: 0, chromaScale: 1 }

type InnerFilter = { id: string; label: string; adjustment: OklabAdjustment }

export const INNER_FILTERS: readonly InnerFilter[] = [
  { id: "none", label: "Gleich", adjustment: IDENTITY },
  { id: "darker", label: "Dunkler", adjustment: { hueDeg: 0, lightnessDelta: -0.2, chromaScale: 1 } },
  { id: "lighter", label: "Heller", adjustment: { hueDeg: 0, lightnessDelta: 0.2, chromaScale: 1 } },
  { id: "complement", label: "Komplementär", adjustment: { hueDeg: 180, lightnessDelta: 0, chromaScale: 1 } },
  { id: "stronger", label: "Kräftiger", adjustment: { hueDeg: 0, lightnessDelta: 0, chromaScale: 1.5 } },
  { id: "muted", label: "Gedämpft", adjustment: { hueDeg: 0, lightnessDelta: 0, chromaScale: 0.5 } },
] as const

/** The filter ids as a non-empty tuple for `z.enum`. Derived from
 * `INNER_FILTERS` so the schema can't drift from the preset table. */
export const INNER_FILTER_IDS = INNER_FILTERS.map((f) => f.id) as [string, ...string[]]

export const DEFAULT_INNER_FILTER = "darker"

const BY_ID: ReadonlyMap<string, OklabAdjustment> = new Map(
  INNER_FILTERS.map((f) => [f.id, f.adjustment]),
)

/** Resolve a filter id to its OKLab adjustment (identity for an unknown id). */
export function resolveInnerFilter(id: string): OklabAdjustment {
  return BY_ID.get(id) ?? IDENTITY
}
