import { z } from "zod"

import type { TraceDefinition } from "./types"
import {
  DEFAULT_PRIMARY_COUNT,
  DEFAULT_SUPERCELL_MM,
  MIN_SUPERCELL_MM,
} from "./numerate-grid-math"

export const numerateSchema = z.object({
  // Numerate grid model: the user sets a base supercell size in mm,
  // optionally stretches it on one axis, and gives the EXACT cell
  // count on the primary axis (picked from image orientation). The
  // secondary axis count + centred border are derived — see
  // `resolveNumerateGrid` in numerate-grid-math.ts.
  supercell_mm: z.coerce.number().min(MIN_SUPERCELL_MM).default(DEFAULT_SUPERCELL_MM),
  multiple_axis: z.enum(["none", "horizontal", "vertical"]).default("none"),
  multiple: z.coerce.number().int().min(1).default(1),
  primary_count: z.coerce.number().int().min(1).default(DEFAULT_PRIMARY_COUNT),
  stroke_width: z.coerce.number().min(0.1).max(20).default(1),
  show_colors: z.coerce.boolean().default(true),
  // F20: palette quantisation. vtracer collapses adjacent same-color
  // superpixel cells into one polygon — without quantisation each
  // cell's mean is unique and no merging happens.
  num_colors: z.coerce.number().int().min(2).max(256).default(16),
})

export type NumerateParams = z.infer<typeof numerateSchema>

export const numerateTrace = {
  id: "numerate",
  label: "Numerate",
  schema: numerateSchema,
  meta: {
    title: "Numerate",
    description: "Create a vector grid overlay from supercells.",
  },
  ui: {
    supercell_mm: { kind: "decimal", label: "Supercell size (mm)", min: MIN_SUPERCELL_MM, step: 0.5 },
    multiple_axis: {
      kind: "select",
      label: "Stretch axis",
      options: [
        { value: "none", label: "None (square)" },
        { value: "horizontal", label: "Horizontal" },
        { value: "vertical", label: "Vertical" },
      ],
    },
    multiple: { kind: "int", label: "Stretch factor", min: 1 },
    primary_count: { kind: "int", label: "Cells (primary axis)", min: 1 },
    stroke_width: { kind: "decimal", label: "Vector Line Width (px)", min: 0.1, max: 20, step: 0.1 },
    show_colors: { kind: "boolean", label: "Show Colors" },
    num_colors: { label: "Number of Colors", min: 2, max: 256 },
  },
} as const satisfies TraceDefinition<typeof numerateSchema>
