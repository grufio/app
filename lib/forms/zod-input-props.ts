import { z } from "zod"

/**
 * Extract `min` / `max` / `step` for an `<input type="number">` from a
 * Zod schema slice (e.g. `pixelateSchema.shape.num_colors`). Mirrors
 * the constraints the form's submit would enforce so the input's
 * browser-side validation tracks the Zod schema automatically —
 * dropping a hardcoded `inputProps={{ min: NUM_COLORS_MIN, max:
 * NUM_COLORS_MAX, step: 1 }}` and the drift risk that came with it.
 *
 * Uses Zod's public `z.toJSONSchema` (Zod 4+) — no `_def` poking. The
 * JSON-Schema output carries `minimum` / `maximum` from `.min(n)` /
 * `.max(n)` calls and infers `step: 1` when the schema is integer
 * (`type: "integer"` from `.int()`). `step` for decimal fields is a
 * UI-only choice (Zod has no step concept) — callers can override
 * via the spread when they need a different granularity.
 */
export function extractNumberInputProps(schema: z.ZodTypeAny): {
  min?: number
  max?: number
  step?: number
} {
  const json = z.toJSONSchema(schema) as {
    type?: string
    minimum?: number
    maximum?: number
  }
  const out: { min?: number; max?: number; step?: number } = {}
  if (typeof json.minimum === "number") out.min = json.minimum
  if (typeof json.maximum === "number") out.max = json.maximum
  if (json.type === "integer") out.step = 1
  return out
}
