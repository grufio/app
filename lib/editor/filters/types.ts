import type { z } from "zod"

export type FilterFieldUI = {
  min?: number
  max?: number
  step?: number
  description?: string
}

export type FilterDefinition<TSchema extends z.ZodType> = {
  id: string
  label: string
  schema: TSchema
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
