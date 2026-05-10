import type { ReactNode } from "react"
import type { z } from "zod"

export type FilterSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

/**
 * Which input control a generic FilterForm should render for a field.
 *
 * - `int` — numeric input that coerces to integer (default when omitted
 *   for fields with no `options`).
 * - `decimal` — numeric input that allows fractional values (e.g.
 *   lineart's smoothness slider).
 * - `boolean` — checkbox.
 * - `select` — dropdown driven by `options`.
 *
 * Inferred default: if `options` is set the kind is `select`; otherwise
 * `int`. Anything boolean / decimal must be set explicitly.
 */
export type FilterFieldKind = "int" | "decimal" | "boolean" | "select"

export type FilterFieldUI = {
  /**
   * Visible label for the form control. Forms must read this from the
   * registry so the dialog and any future generic FilterForm see the
   * same text — drift between hardcoded UI strings and registry was
   * the F5 finding this hint resolves.
   */
  label?: string
  /** Input control to render. See FilterFieldKind. */
  kind?: FilterFieldKind
  min?: number
  max?: number
  step?: number
  description?: string
  /**
   * Static option list for select-style fields. Strings only — registry
   * is React-free. UI consumers can lift these into richer option types
   * (icons, etc.) at the call site.
   */
  options?: ReadonlyArray<FilterSelectOption>
}

export type FilterDialogMeta = {
  title?: string
  description?: string
}

/**
 * Per-render context the GenericFilterForm hands to the registry's
 * optional hooks. Filters that need contextual data (current image
 * dimensions, prior-filter outputs) read from here instead of the
 * controller having to know about each filter individually.
 */
export type FilterRenderContext = {
  imageWidth: number
  imageHeight: number
  /** Pixelate-supplied superpixel grid the chained Numerate filter inherits. */
  numerateSuperpixelWidth: number
  numerateSuperpixelHeight: number
}

export type FilterDefinition<TSchema extends z.ZodType> = {
  id: string
  label: string
  schema: TSchema
  /**
   * Dialog-level metadata used by the controllers (title shown in the
   * dialog header, supporting description below it). Picker and
   * controller share the same source so labels can't drift.
   */
  meta?: FilterDialogMeta
  /**
   * Optional UI hints per field. Forms read `min/max/step` for input
   * constraints and `description` for help text. The schema remains
   * the source of truth for validation; these hints are for rendering
   * only. A registry test verifies that UI bounds are within the
   * schema's accepted range so the form cannot accept a value the
   * schema would reject.
   */
  ui?: Record<string, FilterFieldUI>
  /**
   * Optional render hook the GenericFilterForm calls after the schema-
   * driven fields. Pixelate uses it to surface the live "pixel count"
   * grid; numerate to show the inherited Pixelate superpixel banner.
   */
  helperState?: (args: { params: z.infer<TSchema>; ctx: FilterRenderContext }) => ReactNode
  /**
   * Optional pre-submit transform. Lets a filter inject context-only
   * params (e.g. numerate inherits superpixel_width/_height from
   * Pixelate) without exposing them as form fields. Returned object
   * replaces the form-collected params before `onApply`.
   */
  transformBeforeSubmit?: (args: { params: z.infer<TSchema>; ctx: FilterRenderContext }) => z.infer<TSchema>
}

export type FilterParamsOf<TDef extends FilterDefinition<z.ZodType>> = z.infer<TDef["schema"]>
