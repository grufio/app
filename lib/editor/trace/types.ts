/**
 * Trace registry types.
 *
 * The Trace surface (pixelate, linerate) reuses the FilterDefinition
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
}

export type TraceDefinition<TSchema extends z.ZodType> = FilterDefinition<TSchema, TraceRenderContext>
