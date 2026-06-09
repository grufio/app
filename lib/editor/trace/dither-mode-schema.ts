/**
 * Shared `dither_mode` + `dither_strength` schema slice used by both
 * pixelate + circulate traces. The trace pipeline dispatches at the
 * snap step:
 *   - `"none"`            → plain nearest-palette snap
 *   - `"knoll_yliluoma"`  → Knoll-Yliluoma candidate selection +
 *                            blue-noise threshold (PR-D)
 *   - `"floyd_steinberg"` → Floyd-Steinberg error diffusion (PR-E)
 *   - `"texture"`         → blue-noise neighbour-invasion of monochrome
 *                            interiors (the former separate Texture
 *                            checkbox, folded in as a dither variant)
 *
 * Default `"knoll_yliluoma"` since PR-G (post-smoke-validation flip
 * from the original `"none"` in PR-F). Knoll-Yliluoma was picked
 * over Floyd-Steinberg because:
 *   - it dithers uniform regions organically (the user-reported
 *     "Monochromflächen aufpuckt — haut nicht hin" symptom)
 *   - it has no directional bias (FS produces visible scan-direction
 *     "worm" patterns)
 *   - the blue-noise threshold reuses the LUT already loaded by the
 *     existing texture step, so the LUT fetch isn't a new cost
 *
 * `dither_strength` is a discrete fraction in {0.25, 0.5, 0.75, 1.0}
 * (25 / 50 / 75 / 100 %) consumed by both KY and texture. For KY it
 * maps to candidate count `N` via the range-based helper
 * `_strength_to_ky_n` in `filter-service/app/cell_colors.py`
 * ({0.25→2, 0.5→4, 0.75→8, 1.0→16}); for texture it's the
 * neighbour-invasion strength directly. None and Floyd-Steinberg
 * ignore it (FS has no knob).
 */
import { z } from "zod"

export const DITHER_MODES = [
  "none",
  "knoll_yliluoma",
  "floyd_steinberg",
  "texture",
] as const
export type DitherMode = (typeof DITHER_MODES)[number]
export const ditherModeSchema = z.enum(DITHER_MODES).default("knoll_yliluoma")

/**
 * Discrete strength steps (0.25 / 0.5 / 0.75 / 1.0). Stored as float
 * fractions matching the wire contract with the filter-service.
 *
 * Strength is meaningful only for `dither_mode` ∈ {`"knoll_yliluoma"`,
 * `"texture"`}. None and Floyd-Steinberg consume but ignore it.
 */
export const DITHER_STRENGTHS = [0.25, 0.5, 0.75, 1] as const
export type DitherStrength = (typeof DITHER_STRENGTHS)[number]
export const ditherStrengthSchema = z
  .union([z.literal(0.25), z.literal(0.5), z.literal(0.75), z.literal(1)])
  .default(0.5)
