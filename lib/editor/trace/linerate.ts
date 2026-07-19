import { z } from "zod"

import { paletteRestrictionSchema } from "./palette-restriction-schema"
import type { TraceDefinition } from "./types"

/**
 * Linerate — perceptual paint-by-numbers (P³). The server pipeline makes
 * colour == region in one step:
 * L0 edge-preserving flatten → select ≤num_colors REAL paints from the fixed
 * palette → per-pixel paint assignment (convex Potts relaxation) → paintability
 * dissolve → shared-arc smoothing → distance-transform numbers. Adjacent
 * regions always differ in colour by construction; watertight output. Renders
 * via the bespoke `LinerateDialog`.
 */
export const linerateSchema = z.object({
  // Black stroke width around each region.
  line_thickness: z.coerce.number().min(0.1).max(10).default(1),
  // Flatten ∈ [0, 1] → L0 edge-preserving smoothing strength. Higher = flatter,
  // more painterly (texture/noise removed, strong edges kept crisp).
  flatten: z.coerce.number().min(0).max(1).default(0.25),
  // Detail ∈ [0, 1] → region granularity. Higher = more, finer regions; lower =
  // fewer, larger regions. Maps to the Potts regularisation λ in the service.
  detail: z.coerce.number().min(0).max(1).default(0.75),
  // Smoothness ∈ [0, 1]. 0 = close to the working pixel boundary, 1 = very
  // smooth curves. Maps to RDP epsilon + Chaikin iterations on the shared
  // boundary arcs inside the Python service.
  smoothness: z.coerce.number().min(0).max(1).default(0.6),
  // Radius ∈ [0, 1] → the "Radius" dial: the paintability WIDTH test uses this
  // fraction of the Min-Gap radius. Lower = thinner paintable strokes survive (fewer
  // over-merges); only clearly sub-Min-Gap slivers still merge. Default 0.333 (the
  // analysed knee). Presented in the dialog as a 1–10 level like detail/flatten.
  radius: z.coerce.number().min(0).max(1).default(0.333),
  // Maximum number of distinct REAL paints selected from the fixed palette.
  num_colors: z.coerce.number().int().min(2).max(560).default(32),
  // How those ≤num_colors paints are chosen — same shared reduction as
  // pixelate/circulate: "top_n" (most-used chips) or "pam" (k-medoids).
  palette_restriction: paletteRestrictionSchema,
  // Smallest paintable gap between the outlines, in mm on the printed page.
  // Regions narrower than this dissolve into their neighbour so every surviving
  // region stays paintable + holds its number. 0 = off.
  min_paintable_mm: z.coerce.number().min(0).max(20).default(4),
  // Which Munsell palette to select paints from — same contract as
  // pixelate / circulate. "color" → lab_munsell, "bw" → lab_grays.
  color_mode: z.enum(["color", "bw"]).default("color"),
  // Work resolution the server labels at (form fidelity vs latency). The bridge
  // maps this to the `work_edge` px the service uses; higher = finer region
  // boundaries but slower. Default "medium".
  resolution: z.enum(["low", "medium", "high"]).default("medium"),
})

export type LinerateParams = z.infer<typeof linerateSchema>

/** Resolution preset → server work-edge (px). Higher = finer form, slower. */
export const LINERATE_RESOLUTION_EDGE = { low: 640, medium: 720, high: 960 } as const
export type LinerateResolution = keyof typeof LINERATE_RESOLUTION_EDGE

/**
 * UI-only 1–10 granularity scale for the flatten / detail / smoothness dials.
 * These params stay 0–1 floats on the wire and in storage — the dialog just
 * presents them as ten even steps (a raw 0.05-float input was unintuitive).
 * `levelToUnit`/`unitToLevel` are exact inverses over the integers 1..10.
 * A 10-step scale only addresses 1/9 ≈ 0.11 increments, so the legacy defaults
 * (0.25/0.75/0.6) snap to the nearest step the first time a level is picked;
 * an untouched value keeps its exact stored float.
 */
export const LINERATE_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

export function levelToUnit(level: number): number {
  const clamped = Math.min(10, Math.max(1, Math.round(level)))
  return (clamped - 1) / 9
}

export function unitToLevel(unit: number): number {
  return Math.min(10, Math.max(1, Math.round(unit * 9) + 1))
}

export const linerateTrace = {
  id: "linerate",
  label: "Linerate",
  schema: linerateSchema,
  meta: {
    title: "Linerate",
    description:
      "Perceptual paint-by-numbers: watertight colored regions with black outlines and one number per region. Adjacent regions always differ in color.",
  },
  ui: {
    // `line_thickness` is fixed at 1 (a constant non-scaling hairline) — no
    // dialog control for it; the trace is always a hairline outline.
    flatten: { kind: "decimal", label: "Flatten", min: 0, max: 1, step: 0.05, description: "Painterly flattening (0=raw detail, 1=very flat). Removes texture/noise, keeps edges crisp." },
    detail: { kind: "decimal", label: "Density", min: 0, max: 1, step: 0.05, description: "Region density (0=few large regions, 1=many fine regions)" },
    smoothness: { kind: "decimal", label: "Smoothness", min: 0, max: 1, step: 0.05, description: "Edge smoothness (0=follow working pixels, 1=heavy curve smoothing)" },
    radius: { kind: "decimal", label: "Radius", min: 0, max: 1, step: 0.05, description: "Paintable stroke width vs Min. Gap (lower = keep thinner strokes, more fine regions)" },
    num_colors: { label: "Number of Colors", min: 2, max: 64, description: "Selection budget: max distinct paints picked from the palette (2-64 in the dialog)" },
    palette_restriction: { kind: "select", label: "Palette selection", options: [{ value: "top_n", label: "Top-N" }, { value: "pam", label: "PAM" }], description: "How paints are chosen: Top-N (most-used chips) or PAM (k-medoids). Coverage-based." },
    min_paintable_mm: { kind: "decimal", label: "Min. Gap (mm)", min: 0, max: 20, step: 0.5, description: "Smallest paintable gap between outlines in mm (0=off). Thinner regions merge so each stays paintable + fits its number." },
    color_mode: { kind: "select", label: "Color mode", options: [{ value: "color", label: "Color" }, { value: "bw", label: "B/W" }], description: "Which Munsell palette to select paints from" },
    resolution: { kind: "select", label: "Resolution", options: [{ value: "low", label: "Low (640)" }, { value: "medium", label: "Medium (720)" }, { value: "high", label: "High (960)" }], description: "Work resolution: higher = finer region shapes but a slower trace" },
  },
} as const satisfies TraceDefinition<typeof linerateSchema>
