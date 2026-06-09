import { z } from "zod"

import type { TraceDefinition } from "./types"
import { numColorsSchema } from "./num-colors-schema"
import { preSnapChromaScaleSchema } from "./chroma-scale-schema"
import { distanceMetricSchema } from "./distance-metric-schema"
import { ditherModeSchema, ditherStrengthSchema } from "./dither-mode-schema"
import { paletteRestrictionSchema } from "./palette-restriction-schema"
import { DEFAULT_SUPERCELL_MM, MIN_SUPERCELL_MM } from "./pixelate-grid-math"

export const pixelateSchema = z.object({
  // Superpixel edge length per axis in mm — rectangular cells allowed.
  // Cell count per axis derives from the image's displayed size on
  // the artboard (see `resolvePixelateGrid` in pixelate-grid-math.ts).
  // Whatever doesn't divide into a whole supercell is centered and
  // cropped at trace time.
  supercell_width_mm: z.coerce.number().min(MIN_SUPERCELL_MM).default(DEFAULT_SUPERCELL_MM),
  supercell_height_mm: z.coerce.number().min(MIN_SUPERCELL_MM).default(DEFAULT_SUPERCELL_MM),
  // Palette mode: `color` → the active tier of `lab_munsell` (256 chips
  // post-#396) plus the 48 `lab_grays` appended (#399). `bw` → `lab_grays`
  // only. Drives which DB palette the server snaps cells to (the OKLab
  // nearest-match).
  color_mode: z.enum(["color", "bw"]).default("color"),
  // Maximum number of distinct palette chips in the rendered output.
  // Shared with circulate via `num-colors-schema.ts`.
  num_colors: numColorsSchema,
  // Pre-snap chroma boost factor in OKLCh. Default 1.2 lifts dull-
  // averaged cells into more saturated palette regions so the picked
  // chip-set spans more of the palette. Shared via
  // `chroma-scale-schema.ts`.
  pre_snap_chroma_scale: preSnapChromaScaleSchema,
  // Dithering at the snap step. `"none"` plain snap, `"knoll_yliluoma"`
  // / `"floyd_steinberg"` substitute the snap with the matching
  // algorithm, `"texture"` snaps + blue-noise neighbour-invasion (the
  // former separate Texture checkbox, folded in as a dither variant).
  // Strength is meaningful for KY (candidate count) and texture
  // (invasion strength); None and FS ignore it.
  dither_mode: ditherModeSchema,
  dither_strength: ditherStrengthSchema,
  // Snap-step distance metric (PR-H). Default `"oklab"` preserves
  // byte-identical pre-feature behaviour; `"ciede2000"` switches the
  // plain snap path to CIE Lab D65 + ΔE00. KY/FS dithering keep
  // squared-Euclidean argmin regardless — see `distance-metric-schema.ts`
  // for the rationale and the `pre_snap_chroma_scale` interaction.
  distance_metric: distanceMetricSchema,
  // Palette-cap strategy (PR-I). Default `"top_n"` preserves byte-
  // identical pre-feature behaviour (post-snap count-based cap). When
  // `"pam"`, the palette is restricted PRE-snap to `num_colors` medoid
  // chips via k-medoid clustering, and the post-snap reduction is
  // skipped. See `palette-restriction-schema.ts` for the trade-off and
  // the interaction with `distance_metric` (PAM uses the active metric
  // for its distance matrix).
  palette_restriction: paletteRestrictionSchema,
})

export type PixelateParams = z.infer<typeof pixelateSchema>

// `meta` + `ui` are only consumed by `GenericTraceController` (which
// renders `BaseFilterController` + `GenericFilterForm`). Pixelate uses
// the bespoke `PixelateDialog` + `PixelateForm`, which hardcode the
// labels in German and ignore both fields — so we don't carry the
// orphan English copy here.
export const pixelateTrace = {
  id: "pixelate",
  label: "Pixelate",
  schema: pixelateSchema,
} as const satisfies TraceDefinition<typeof pixelateSchema>
