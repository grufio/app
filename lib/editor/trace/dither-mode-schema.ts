/**
 * Shared `dither_mode` + `dither_pattern_size` schema slice used by both
 * pixelate + circulate traces. The trace pipeline dispatches at the
 * snap step:
 *   - `"none"`            → plain nearest-palette snap (= pre-PR-F
 *                            behaviour, byte-identical)
 *   - `"knoll_yliluoma"`  → Knoll-Yliluoma candidate selection +
 *                            blue-noise threshold (PR-D)
 *   - `"floyd_steinberg"` → Floyd-Steinberg error diffusion (PR-E)
 *
 * Default `"none"` keeps persisted trace rows without these fields
 * applying byte-identically to the pre-PR-F pipeline. PR-G flips the
 * default after smoke validation.
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
export const ditherModeSchema = z.enum(DITHER_MODES).default("none")

export const DITHER_PATTERN_SIZES = [2, 4, 8, 16] as const
export type DitherPatternSize = (typeof DITHER_PATTERN_SIZES)[number]
export const ditherPatternSizeSchema = z.coerce
  .number()
  .int()
  .refine((n) => (DITHER_PATTERN_SIZES as readonly number[]).includes(n), {
    message: `must be one of ${DITHER_PATTERN_SIZES.join(", ")}`,
  })
  .default(4)
