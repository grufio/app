/**
 * Trace registry types.
 *
 * The Trace surface (numerate, lineart) reuses the FilterDefinition
 * shape but with its own render context — Trace pulls superpixel
 * dimensions inherited from a prior Pixelate filter; bitmap
 * filters never see those.
 */
import type { z } from "zod"

import type { FilterDefinition } from "@/lib/editor/filters/types"

export type {
  FilterFieldKind as TraceFieldKind,
  FilterFieldUI as TraceFieldUI,
  FilterDialogMeta as TraceDialogMeta,
  FilterSelectOption as TraceSelectOption,
} from "@/lib/editor/filters/types"

export type TraceRenderContext = {
  imageWidth: number
  imageHeight: number
  /**
   * Superpixel grid Numerate inherits from a prior Pixelate filter
   * (or the form's default 10×10 when no Pixelate filter is
   * active). Lineart ignores these.
   */
  numerateSuperpixelWidth: number
  numerateSuperpixelHeight: number
}

export type TraceDefinition<TSchema extends z.ZodType> = FilterDefinition<TSchema, TraceRenderContext>
