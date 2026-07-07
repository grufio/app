import { z } from "zod"

import type { TraceDefinition } from "./types"

export const lineartSchema = z.object({
  // Black stroke width around each colored region.
  line_thickness: z.coerce.number().min(0.1).max(10).default(1),
  // Pre-vtracer Gaussian blur radius. Smooths sensor noise before
  // palette quantisation so the resulting regions track real subject
  // boundaries instead of speckle.
  blur_amount: z.coerce.number().int().min(0).max(20).default(3),
  // Smoothness ∈ [0, 1]. 0 = sharp corners (close to the
  // quantised-pixel boundary), 1 = very smooth spline curves. Maps
  // to vtracer's corner_threshold + length_threshold +
  // filter_speckle inside the Python service.
  smoothness: z.coerce.number().min(0).max(1).default(0.6),
  // Median-cut pre-quantisation for vtracer's region detection. The
  // post-vtracer step snaps each region's fill to the nearest
  // Munsell chip (selected by `color_mode` below), so this value
  // only controls how many distinct regions vtracer carves out,
  // NOT how many palette chips the output uses.
  num_colors: z.coerce.number().int().min(2).max(256).default(8),
  // Which Munsell palette to snap region fills against — same
  // contract as pixelate / circulate. "color" → lab_munsell (128
  // chips), "bw" → lab_grays (48). Default "color" keeps existing
  // traces visually equivalent to their pre-snap median-cut output
  // when the upstream median-cut bins happen to already land near
  // palette chips.
  color_mode: z.enum(["color", "bw"]).default("color"),
})

export type LineartParams = z.infer<typeof lineartSchema>

/**
 * vtracer config shared with the server (`filter-service/app/lineart.py`
 * `LINEART_VTRACER_PARAMS`). The client WASM preview
 * (`lineart-vtracer-wasm.ts`) traces with the SAME engine + params so the
 * preview geometry matches the Apply result. Keep in lockstep with the
 * Python constant (`colormode="color"`, `mode="spline"`,
 * `hierarchical="cutout"` are fixed on the WASM call site).
 */
export const LINEART_VTRACER_CONFIG = {
  colorPrecision: 8,
  layerDifference: 0,
  pathPrecision: 2,
  spliceThreshold: 45,
} as const

/**
 * Map `smoothness` ∈ [0, 1] to vtracer's corner/length/speckle thresholds —
 * the same three lines the server runs in `lineart_to_svg`:
 *   corner_threshold = round(180 - s*120)   (0=sharp corners, 1=strong curves)
 *   length_threshold = round(s*8, 2)         (path simplification)
 *   filter_speckle   = max(16, round(s*32))  (drop small blobs)
 * The WASM binding clamps `length_threshold` to its documented [3.5, 10]
 * range (same clamp the native vtracer core applies), so the server's sub-3.5
 * values and the WASM values resolve identically — both feed vtracer 0.6.
 */
export function smoothnessToVtracerParams(smoothness: number): {
  cornerThreshold: number
  lengthThreshold: number
  filterSpeckle: number
} {
  const s = Math.max(0, Math.min(1, smoothness))
  return {
    cornerThreshold: Math.round(180 - s * 120),
    lengthThreshold: Math.round(s * 8 * 100) / 100,
    filterSpeckle: Math.max(16, Math.round(s * 32)),
  }
}

export const lineartTrace = {
  id: "lineart",
  label: "Line Art",
  schema: lineartSchema,
  meta: {
    title: "Line Art",
    description: "Vectorise the image into organic colored regions with black outlines.",
  },
  ui: {
    line_thickness: { kind: "decimal", label: "Line Thickness", min: 0.1, max: 10, step: 0.1, description: "Stroke width in pixels (0.1-10)" },
    blur_amount: { label: "Blur Amount", min: 0, max: 20, description: "Pre-trace blur to merge noisy speckle (0-20, 0=no blur)" },
    smoothness: { kind: "decimal", label: "Smoothness", min: 0, max: 1, step: 0.05, description: "Edge smoothness (0=follow quantised pixels exactly, 1=heavy curve smoothing)" },
    num_colors: { label: "Number of Colors", min: 2, max: 256, description: "Palette size (2-256). Fewer colors = bolder regions" },
    color_mode: { kind: "select", label: "Color mode", options: [{ value: "color", label: "Color" }, { value: "bw", label: "B/W" }], description: "Which Munsell palette to snap region fills against" },
  },
} as const satisfies TraceDefinition<typeof lineartSchema>
