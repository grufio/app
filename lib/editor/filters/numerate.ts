import { z } from "zod"

import type { FilterDefinition } from "./types"

export const numerateSchema = z.object({
  superpixel_width: z.coerce.number().int().min(1).default(10),
  superpixel_height: z.coerce.number().int().min(1).default(10),
  stroke_width: z.coerce.number().int().min(1).max(20).default(2),
  show_colors: z.coerce.boolean().default(true),
})

export type NumerateParams = z.infer<typeof numerateSchema>

export const numerateFilter = {
  id: "numerate",
  label: "Numerate",
  schema: numerateSchema,
  meta: {
    title: "Numerate",
    description: "Create a vector grid overlay from pixelated superpixels.",
  },
  ui: {
    // superpixel_width / _height are injected from the Pixelate filter's
    // grid math (controller passes them) and not surfaced in the form,
    // so they intentionally have no `label` here.
    superpixel_width: { min: 1 },
    superpixel_height: { min: 1 },
    stroke_width: { label: "Vector Line Width (px)", min: 1, max: 20 },
    show_colors: { label: "Show Colors" },
  },
} as const satisfies FilterDefinition<typeof numerateSchema>
