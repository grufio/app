import { z } from "zod"

import { FormField } from "@/components/ui/form-controls"

import type { FilterDefinition } from "./types"

export const pixelateSchema = z.object({
  superpixel_width: z.coerce.number().int().min(1).default(10),
  superpixel_height: z.coerce.number().int().min(1).default(10),
  num_colors: z.coerce.number().int().min(2).max(256).default(16),
  color_mode: z.enum(["rgb", "grayscale"]).default("rgb"),
})

export type PixelateParams = z.infer<typeof pixelateSchema>

export const pixelateFilter = {
  id: "pixelate",
  label: "Pixelate",
  schema: pixelateSchema,
  meta: {
    title: "Pixelate",
    description: "Configure pixelate filter settings.",
  },
  ui: {
    superpixel_width: { label: "Superpixel Width (px)", min: 1 },
    superpixel_height: { label: "Superpixel Height (px)", min: 1 },
    num_colors: { label: "Number of Colors", min: 2, max: 256 },
    color_mode: {
      kind: "select",
      label: "Color Mode",
      options: [
        { value: "rgb", label: "RGB" },
        { value: "grayscale", label: "Grayscale" },
      ],
    },
  },
  // Live "pixel count" grid: derived from superpixel_* and the source
  // image's dimensions. Mirrors the readonly fields the per-filter
  // PixelateForm rendered before consolidation (F7+F8).
  helperState: ({ params, ctx }) => {
    const w = Math.max(1, params.superpixel_width)
    const h = Math.max(1, params.superpixel_height)
    const pixelCountWidth = Math.floor(ctx.imageWidth / w)
    const pixelCountHeight = Math.floor(ctx.imageHeight / h)
    return (
      <>
        <FormField
          variant="numeric"
          numericMode="int"
          label="Pixel Count Width (calculated)"
          id="pixel-count-width"
          value={String(pixelCountWidth)}
          onCommit={() => {}}
          disabled
          inputProps={{ readOnly: true }}
        />
        <FormField
          variant="numeric"
          numericMode="int"
          label="Pixel Count Height (calculated)"
          id="pixel-count-height"
          value={String(pixelCountHeight)}
          onCommit={() => {}}
          disabled
          inputProps={{ readOnly: true }}
        />
      </>
    )
  },
} as const satisfies FilterDefinition<typeof pixelateSchema>
