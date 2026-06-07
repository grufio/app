/**
 * Shared `dither_mode` + `dither_pattern_size` schema slice used by both
 * pixelate + circulate traces. The trace pipeline dispatches at the
 * snap step:
 *   - `"none"`            → plain nearest-palette snap
 *   - `"knoll_yliluoma"`  → Knoll-Yliluoma candidate selection +
 *                            blue-noise threshold (PR-D)
 *   - `"floyd_steinberg"` → Floyd-Steinberg error diffusion (PR-E)
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
 * When the cell-mean coincides with a palette chip, candidate
 * selection collapses to that chip (Yliluoma 2014 §2 identity case),
 * so cells that ALREADY snapped cleanly stay byte-identical to the
 * pre-default-flip output. Effectively: dithering only "kicks in"
 * where the old pipeline would have lost colour information.
 *
 * `dither_pattern_size` is the Knoll-Yliluoma candidate count
 * (`N` in Yliluoma 2014 §2). N=1 collapses to plain nearest-neighbour
 * (= "none" semantically, but the form keeps the modes separate so
 * users can pick mode independently of pattern size). N=2/4/8/16 are
 * the supported discrete tiers — visible-pattern coarseness vs
 * smoothness of the implied tone-mapping. Ignored when mode is
 * `"none"` or `"floyd_steinberg"`.
 */
import { z } from "zod"

export const DITHER_MODES = ["none", "knoll_yliluoma", "floyd_steinberg"] as const
export type DitherMode = (typeof DITHER_MODES)[number]
export const ditherModeSchema = z.enum(DITHER_MODES).default("knoll_yliluoma")

export const DITHER_PATTERN_SIZES = [2, 4, 8, 16] as const
export type DitherPatternSize = (typeof DITHER_PATTERN_SIZES)[number]
export const ditherPatternSizeSchema = z.coerce
  .number()
  .int()
  .refine((n) => (DITHER_PATTERN_SIZES as readonly number[]).includes(n), {
    message: `must be one of ${DITHER_PATTERN_SIZES.join(", ")}`,
  })
  .default(4)
