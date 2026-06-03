import { z } from "zod"

import type { TraceDefinition } from "./types"
import { numColorsSchema } from "./num-colors-schema"
import { DEFAULT_SUPERCELL_MM, MIN_SUPERCELL_MM } from "./pixelate-grid-math"

export const pixelateSchema = z.object({
  // Superpixel edge length per axis in mm — rectangular cells allowed.
  // Cell count per axis derives from the image's displayed size on
  // the artboard (see `resolvePixelateGrid` in pixelate-grid-math.ts).
  // Whatever doesn't divide into a whole supercell is centered and
  // cropped at trace time.
  supercell_width_mm: z.coerce.number().min(MIN_SUPERCELL_MM).default(DEFAULT_SUPERCELL_MM),
  supercell_height_mm: z.coerce.number().min(MIN_SUPERCELL_MM).default(DEFAULT_SUPERCELL_MM),
  // Palette mode: `color` → the 128-chip Munsell palette (`lab_munsell`);
  // `bw` → the 48 greys (`lab_grays`). Strictly separate, no mixing. Drives
  // which DB palette the server snaps cells to (the OKLab nearest-match).
  color_mode: z.enum(["color", "bw"]).default("color"),
  // Maximum number of distinct palette chips in the rendered output.
  // Shared with circulate via `num-colors-schema.ts`.
  num_colors: numColorsSchema,
  // Blue-noise neighbour-invasion texture. `texture_enabled` is the form's
  // checkbox state; `texture_strength` is the chosen Select level (25/50/75/
  // 100% expressed as a 0..1 fraction) and is preserved when the checkbox
  // toggles off — like circulate's `inner_*` fields. Defaults make the
  // pipeline output byte-identical to the pre-feature behaviour, so old
  // persisted trace rows without these fields keep applying unchanged.
  texture_enabled: z.boolean().default(false),
  texture_strength: z.coerce.number().min(0.25).max(1).default(0.5),
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
