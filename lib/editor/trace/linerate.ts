import { z } from "zod"

import type { TraceDefinition } from "./types"

/**
 * Linerate — segmentation-based paint-by-numbers (the sibling to `lineart`,
 * which is vtracer-based). Same user-facing knobs as lineart; the server
 * pipeline is entirely different (connected components + shared-arc smoothing
 * + distance-transform numbers → watertight output). Renders via the
 * schema-driven `GenericTraceController` (no bespoke dialog).
 */
export const linerateSchema = z.object({
  // Black stroke width around each region.
  line_thickness: z.coerce.number().min(0.1).max(10).default(1),
  // Pre-segmentation Gaussian blur — smooths sensor noise so regions track
  // real subject boundaries instead of speckle.
  blur_amount: z.coerce.number().int().min(0).max(20).default(2),
  // Smoothness ∈ [0, 1]. 0 = close to the quantised pixel boundary, 1 = very
  // smooth curves. Maps to RDP epsilon + Chaikin iterations on the shared
  // boundary arcs inside the Python service.
  smoothness: z.coerce.number().min(0).max(1).default(0.6),
  // Palette size for the pre-segmentation quantise; drives how many distinct
  // regions the connected-components pass carves out.
  num_colors: z.coerce.number().int().min(2).max(256).default(12),
  // Smallest paintable gap between the outlines, in mm on the printed page.
  // Regions narrower than this merge into their neighbour (raster relabel)
  // so every surviving region stays paintable + holds its number. 0 = off.
  min_paintable_mm: z.coerce.number().min(0).max(20).default(4),
  // Which Munsell palette to snap region fills against — same contract as
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
      "Segmentation paint-by-numbers: watertight colored regions with black outlines and one number per region.",
  },
  ui: {
    line_thickness: { kind: "decimal", label: "Line Thickness", min: 0.1, max: 10, step: 0.1, description: "Stroke width in pixels (0.1-10)" },
    blur_amount: { label: "Blur Amount", min: 0, max: 20, description: "Pre-trace blur to merge noisy speckle (0-20, 0=no blur)" },
    smoothness: { kind: "decimal", label: "Smoothness", min: 0, max: 1, step: 0.05, description: "Edge smoothness (0=follow quantised pixels, 1=heavy curve smoothing)" },
    num_colors: { label: "Number of Colors", min: 2, max: 256, description: "Palette size (2-256). Fewer colors = bolder regions" },
    min_paintable_mm: { kind: "decimal", label: "Min. Gap (mm)", min: 0, max: 20, step: 0.5, description: "Smallest paintable gap between outlines in mm (0=off). Thinner regions merge so each stays paintable + fits its number." },
    color_mode: { kind: "select", label: "Color mode", options: [{ value: "color", label: "Color" }, { value: "bw", label: "B/W" }], description: "Which Munsell palette to snap region fills against" },
  },
} as const satisfies TraceDefinition<typeof linerateSchema>
