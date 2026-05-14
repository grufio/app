import { z } from "zod"

import type { FilterDefinition } from "./types"

/**
 * Soft black-and-white filter (Moon-style): gentle, retains shadow
 * and highlight detail. No user-configurable params. The pixel
 * pipeline (Rec.709 luma → midtone-lift gamma) lives in the Python
 * filter-service `/filters/bw_soft` route.
 */
export const bwSoftSchema = z.object({}).strict()

export type BwSoftParams = z.infer<typeof bwSoftSchema>

export const bwSoftFilter: FilterDefinition<typeof bwSoftSchema> = {
  id: "bw_soft",
  label: "B&W Soft",
  schema: bwSoftSchema,
  meta: {
    title: "B&W Soft",
    description: "Soft black & white, full tonal range.",
  },
}
