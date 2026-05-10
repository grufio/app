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
    show_colors: { kind: "boolean", label: "Show Colors" },
  },
  // Banner showing the inherited Pixelate superpixel grid. Mirrors the
  // muted info-block the per-filter NumerateForm rendered.
  helperState: ({ ctx }) => (
    <div className="rounded-md bg-muted p-3 text-sm space-y-1">
      <p className="font-medium">Superpixel Grid</p>
      <p className="text-muted-foreground">
        Using {ctx.numerateSuperpixelWidth} × {ctx.numerateSuperpixelHeight} px from Pixelate filter
      </p>
    </div>
  ),
  // superpixel_width / _height are not form-rendered for numerate; they
  // come from whichever Pixelate filter sits earlier in the chain. The
  // controller already passes those through context, so we inject them
  // into the params right before submit.
  transformBeforeSubmit: ({ params, ctx }) => ({
    ...params,
    superpixel_width: ctx.numerateSuperpixelWidth,
    superpixel_height: ctx.numerateSuperpixelHeight,
  }),
} as const satisfies FilterDefinition<typeof numerateSchema>
