import { z } from "zod"

import type { LinerateParams } from "./linerate"
import type { TraceDefinition } from "./types"

/**
 * Line Art — maximum paintable detail. Shares linerate's segmentation core
 * (colour == region): every pixel snaps to its nearest chip of the FULL Munsell
 * palette, connected same-paint areas become regions, sub-paintable slivers merge
 * into their most similar-coloured neighbour, watertight arcs smooth the edges,
 * and every region carries a number.
 *
 * There is NO colour-reduction knob (no `num_colors`, no palette selection, no
 * vtracer/median-cut) — that reduced the palette before the trace and was the
 * root cause of the "17 colours" collapse. Detail is bounded only by
 * `min_paintable_mm` (the paintability floor); the colour count emerges from the
 * image.
 */
export const lineartSchema = z.object({
  // Black stroke width around each coloured region.
  line_thickness: z.coerce.number().min(0.1).max(10).default(1),
  // Edge-preserving L0 flatten strength (denoise before segmentation) — higher =
  // flatter/less speckle, lower = maximum detail.
  blur_amount: z.coerce.number().int().min(0).max(20).default(3),
  // Smoothness ∈ [0, 1]: 0 = follow the working-pixel boundary, 1 = heavy curve
  // smoothing. Drives the shared-arc RDP/Chaikin smoothing.
  smoothness: z.coerce.number().min(0).max(1).default(0.6),
  // Smallest paintable gap between the outlines, in mm on the printed page — the
  // ONLY detail limiter. Regions narrower than this merge into their most
  // similar-coloured neighbour so every survivor stays paintable + holds its
  // number. The server converts mm → source px (services/editor/server/trace/lineart.ts).
  min_paintable_mm: z.coerce.number().min(0).max(20).default(4),
  // Which Munsell palette the pixels snap against — "color" → lab_munsell (+grays),
  // "bw" → lab_grays. The FULL palette is used (no reduction).
  color_mode: z.enum(["color", "bw"]).default("color"),
})

export type LineartParams = z.infer<typeof lineartSchema>

/**
 * Adapt Line Art params to the Linerate PREVIEW model so the dialog can reuse
 * `LineratePreviewPane` (the client mirror of the shared segmentation core)
 * instead of maintaining a second preview engine. The two Apply pipelines share
 * the same L0 flatten + coverage snap + facet merge; Line Art is exactly the
 * linerate model pinned to "full palette, finest detail":
 *   - `detail: 1` → the facet min-area collapses to the paintability floor, so
 *     detail is bounded ONLY by `min_paintable_mm` (matches lineart.py).
 *   - `num_colors: 560` ≥ any real palette size → `coverageSelectPaintMap`'s
 *     `counts.size <= K` early-return fires → the FULL palette is used (no
 *     reduction), matching lineart's full-palette snap.
 *   - `resolution: "high"` → work-edge 960, the lineart service default.
 *   - `flatten: blur_amount/20` maps the 0..20 blur dial onto linerate's 0..1
 *     flatten strength (server: `blur_amount` → L0, same denoise stage).
 * `palette_restriction` is irrelevant once selection is bypassed, but the type
 * requires it; "top_n" is the harmless default.
 */
export function lineartToLineratePreviewParams(draft: LineartParams): LinerateParams {
  return {
    line_thickness: draft.line_thickness,
    flatten: draft.blur_amount / 20,
    detail: 1.0,
    smoothness: draft.smoothness,
    num_colors: 560,
    palette_restriction: "top_n",
    min_paintable_mm: draft.min_paintable_mm,
    color_mode: draft.color_mode,
    resolution: "high",
  }
}

export const lineartTrace = {
  id: "lineart",
  label: "Line Art",
  schema: lineartSchema,
  meta: {
    title: "Line Art",
    description: "Finest paintable paint-by-numbers: the full palette, watertight coloured regions with black outlines, one number each.",
  },
  ui: {
    line_thickness: { kind: "decimal", label: "Line Thickness", min: 0.1, max: 10, step: 0.1, description: "Stroke width in pixels (0.1-10)" },
    blur_amount: { label: "Blur Amount", min: 0, max: 20, description: "Denoise before segmentation (0=max detail, 20=flattest)" },
    smoothness: { kind: "decimal", label: "Smoothness", min: 0, max: 1, step: 0.05, description: "Edge smoothness (0=follow pixels, 1=heavy curve smoothing)" },
    min_paintable_mm: { kind: "decimal", label: "Min. Gap (mm)", min: 0, max: 20, step: 0.5, description: "Smallest paintable gap in mm — the detail limiter. Smaller = finer regions + more colours." },
    color_mode: { kind: "select", label: "Color mode", options: [{ value: "color", label: "Color" }, { value: "bw", label: "B/W" }], description: "Which Munsell palette the pixels snap against" },
  },
} as const satisfies TraceDefinition<typeof lineartSchema>
