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
  const json = jsonSchemaOf(schema)
  const out: { min?: number; max?: number; step?: number } = {}
  if (typeof json.minimum === "number") out.min = json.minimum
  if (typeof json.maximum === "number") out.max = json.maximum
  if (json.type === "integer") out.step = 1
  return out
}

type NumericJsonSchema = {
  type?: string
  minimum?: number
  maximum?: number
  default?: unknown
}

function jsonSchemaOf(schema: z.ZodTypeAny): NumericJsonSchema {
  return z.toJSONSchema(schema) as NumericJsonSchema
}

/**
 * Parse a form-input string for a Zod numeric schema slice.
 *
 * - On parse failure (empty, non-numeric): returns `{ ok: false, value:
 *   <schema default> }`. Callers that want "ignore garbage" semantics
 *   check `ok` and skip; callers that want "fall back to default on
 *   bad input" use `value` directly (which is the same number the Zod
 *   `.default()` carries — no manual `NUM_COLORS_DEFAULT` constant).
 * - On parse success: clamps to `minimum` / `maximum` and returns
 *   `{ ok: true, value: <clamped> }`. This matches what Zod's
 *   `.parse()` would later REJECT — we clamp now so the apply call
 *   never fails on a user-typed below-min value (the prior behaviour
 *   silently accepted out-of-range values into the draft and then
 *   the server-side schema parse rejected them).
 *
 * For integer schemas (`.int()`), parsing is `parseInt(raw, 10)`;
 * otherwise `parseFloat(raw)`. Step is not enforced — that's a UI
 * granularity concern, not a validity constraint.
 */
export function parseFormNumber(
  schema: z.ZodTypeAny,
  raw: string,
): { ok: boolean; value: number } {
  const json = jsonSchemaOf(schema)
  const parsed = json.type === "integer" ? Number.parseInt(raw, 10) : Number.parseFloat(raw)
  if (!Number.isFinite(parsed)) {
    const fallback = typeof json.default === "number" ? json.default : 0
    return { ok: false, value: fallback }
  }
  let clamped = parsed
  if (typeof json.minimum === "number" && clamped < json.minimum) clamped = json.minimum
  if (typeof json.maximum === "number" && clamped > json.maximum) clamped = json.maximum
  return { ok: true, value: clamped }
}

