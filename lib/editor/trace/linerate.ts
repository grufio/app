import { z } from "zod"

import { paletteRestrictionSchema } from "./palette-restriction-schema"
import type { TraceDefinition } from "./types"

/**
 * Linerate — perceptual paint-by-numbers (P³), the sibling to `lineart`
 * (vtracer-based). The server pipeline makes colour == region in one step:
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
  // Maximum number of distinct REAL paints selected from the fixed palette.
  num_colors: z.coerce.number().int().min(2).max(96).default(28),
  // How those ≤num_colors paints are chosen — same shared reduction as
  // pixelate/circulate: "top_n" (most-used chips) or "pam" (k-medoids).
  palette_restriction: paletteRestrictionSchema,
  // Smallest paintable gap between the outlines, in mm on the printed page.
  // Regions narrower than this dissolve into their neighbour so every surviving
  // region stays paintable + holds its number. 0 = off.
  min_paintable_mm: z.coerce.number().min(0).max(20).default(4),
  // Which Munsell palette to select paints from — same contract as
  // lineart / pixelate / circulate. "color" → lab_munsell, "bw" → lab_grays.
  color_mode: z.enum(["color", "bw"]).default("color"),
})

export type LinerateParams = z.infer<typeof linerateSchema>

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
    line_thickness: { kind: "decimal", label: "Line Thickness", min: 0.1, max: 10, step: 0.1, description: "Stroke width in pixels (0.1-10)" },
    flatten: { kind: "decimal", label: "Flatten", min: 0, max: 1, step: 0.05, description: "Painterly flattening (0=raw detail, 1=very flat). Removes texture/noise, keeps edges crisp." },
    detail: { kind: "decimal", label: "Detail", min: 0, max: 1, step: 0.05, description: "Region granularity (0=few large regions, 1=many fine regions)" },
    smoothness: { kind: "decimal", label: "Smoothness", min: 0, max: 1, step: 0.05, description: "Edge smoothness (0=follow working pixels, 1=heavy curve smoothing)" },
    num_colors: { label: "Number of Colors", min: 2, max: 96, description: "Max distinct paints selected from the palette (2-96)" },
    palette_restriction: { kind: "select", label: "Palette selection", options: [{ value: "top_n", label: "Top-N" }, { value: "pam", label: "PAM" }], description: "How paints are chosen: Top-N (most-used chips) or PAM (k-medoids). Coverage-based." },
    min_paintable_mm: { kind: "decimal", label: "Min. Gap (mm)", min: 0, max: 20, step: 0.5, description: "Smallest paintable gap between outlines in mm (0=off). Thinner regions merge so each stays paintable + fits its number." },
    color_mode: { kind: "select", label: "Color mode", options: [{ value: "color", label: "Color" }, { value: "bw", label: "B/W" }], description: "Which Munsell palette to select paints from" },
  },
} as const satisfies TraceDefinition<typeof linerateSchema>
