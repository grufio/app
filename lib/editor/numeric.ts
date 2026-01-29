/**
 * Numeric input parsing/sanitization helpers.
 *
 * Responsibilities:
 * - Normalize user-entered numeric strings for editor inputs.
 * - Keep parsing rules consistent across panels (int vs decimal).
 */
export type NumericMode = "int" | "decimal"

/**
 * Sanitizes user input to numeric-only strings.
 * - `decimal`: allows one "." as decimal separator ("," is normalized to ".")
 * - `int`: digits only
 *
 * Keeps empty string to allow clearing the field.
 */
export function sanitizeNumericInput(raw: string, mode: NumericMode): string {
  const trimmed = raw.trim()
  if (trimmed === "") return ""

  // Heuristic for handling thousands separators:
  // - If the string contains BOTH "," and ".", treat the *last* separator as the decimal separator
  //   and the other as a thousands separator.
  //   - "1,250.00" -> comma thousands, dot decimal
  //   - "1.250,00" -> dot thousands, comma decimal
  // - If the string contains only ",", treat it as decimal separator ("12,34" -> "12.34")
  // - If it contains only ".", keep it as decimal separator
  const hasComma = trimmed.includes(",")
  const hasDot = trimmed.includes(".")
  let normalized = trimmed
  if (hasComma && hasDot) {
    const lastComma = trimmed.lastIndexOf(",")
    const lastDot = trimmed.lastIndexOf(".")
    if (lastDot > lastComma) {
      // dot is decimal separator, commas are thousands separators
      normalized = trimmed.replace(/,/g, "")
    } else {
      // comma is decimal separator, dots are thousands separators
      normalized = trimmed.replace(/\./g, "").replace(/,/g, ".")
    }
  } else if (hasComma && !hasDot) {
    normalized = trimmed.replace(/,/g, ".")
  }

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

