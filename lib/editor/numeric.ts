export type NumericMode = "int" | "decimal"

/**
 * Sanitizes user input to numeric-only strings.
 * - `decimal`: allows one "." as decimal separator ("," is normalized to ".")
 * - `int`: digits only
 *
 * Keeps empty string to allow clearing the field.
 */
export function sanitizeNumericInput(raw: string, mode: NumericMode): string {
  const normalized = raw.replace(",", ".")
  if (normalized === "") return ""

  if (mode === "int") {
    return normalized.replace(/[^\d]/g, "")
  }

  // decimal
  // allow digits + one dot
  let out = ""
  let seenDot = false
  for (const ch of normalized) {
    if (ch >= "0" && ch <= "9") {
      out += ch
      continue
    }
    if (ch === "." && !seenDot) {
      out += "."
      seenDot = true
    }
  }
  return out
}

export function parseNumericInput(raw: string): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : Number.NaN
}

