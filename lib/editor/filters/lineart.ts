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
  meta: {
    title: "Line Art",
    description: "Create comic-style outlines with edge detection.",
  },
  ui: {
    threshold1: { label: "Low Threshold", min: 0, max: 500, description: "Lower value = more edges detected (0-500)" },
    threshold2: { label: "High Threshold", min: 0, max: 500, description: "Must be higher than low threshold" },
    line_thickness: { label: "Line Thickness", min: 1, max: 10, description: "Thickness in pixels (1-10)" },
    blur_amount: { label: "Blur Amount", min: 0, max: 20, description: "Smoothing before edge detection (0-20, 0=no blur)" },
    min_contour_area: { label: "Min. Detail Size", min: 0, max: 10000, step: 50, description: "Minimum contour area in pixels (removes small details)" },
    smoothness: { kind: "decimal", label: "Smoothness", min: 0, max: 0.05, step: 0.001, description: "Curve smoothing (0=sharp corners, 0.02=very smooth)" },
    invert: { kind: "boolean", label: "Black lines on white background", description: "Unchecked = white lines on black" },
  },
} as const satisfies FilterDefinition<typeof lineartSchema>
