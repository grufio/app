import { z } from "zod"

import type { FilterDefinition } from "./types"

export const lineartSchema = z
  .object({
    threshold1: z.coerce.number().int().min(0).default(50),
    threshold2: z.coerce.number().int().min(0).default(200),
    line_thickness: z.coerce.number().int().min(1).max(10).default(2),
    blur_amount: z.coerce.number().int().min(0).max(20).default(3),
    min_contour_area: z.coerce.number().int().min(0).default(500),
    invert: z.coerce.boolean().default(true),
    smoothness: z.coerce.number().min(0).max(0.1).default(0.002),
  })
  .refine((v) => v.threshold1 < v.threshold2, {
    message: "threshold1 must be strictly less than threshold2",
    path: ["threshold1"],
  })

export type LineartParams = z.infer<typeof lineartSchema>

export const lineartFilter = {
  id: "lineart",
  label: "Line Art",
  schema: lineartSchema,
} as const satisfies FilterDefinition<typeof lineartSchema>
