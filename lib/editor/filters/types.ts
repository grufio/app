import type { z } from "zod"

export type FilterSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

export type FilterFieldUI = {
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
}

export type FilterParamsOf<TDef extends FilterDefinition<z.ZodType>> = z.infer<TDef["schema"]>
