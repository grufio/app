import type { z } from "zod"

export type FilterDefinition<TSchema extends z.ZodType> = {
  id: string
  label: string
  schema: TSchema
}

export type FilterParamsOf<TDef extends FilterDefinition<z.ZodType>> = z.infer<TDef["schema"]>
