/**
 * Normalises hex color input to canonical `#RRGGBB` (uppercase).
 *
 * Accepts:
 *   - `"fff"` / `"#fff"`     → `"#FFFFFF"`  (3-digit expansion)
 *   - `"abcdef"` / `"#abcDEF"` → `"#ABCDEF"`
 *   - leading/trailing whitespace
 *
 * Returns `null` for anything else (empty, non-hex chars, wrong
 * length, mid-string `#`).
 *
 * Used by `<FormField variant="color">` to validate user-typed hex
 * before committing.
 */
export function normalizeHex(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // Reject mid-string `#`. Only allow it as a leading character.
  if (trimmed.includes("#") && !trimmed.startsWith("#")) return null

  const withoutHash = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed
  const upper = withoutHash.toUpperCase()

  if (/^[0-9A-F]{3}$/.test(upper)) {
    const expanded = upper
      .split("")
      .map((ch) => ch + ch)
      .join("")
    return `#${expanded}`
  }
  if (/^[0-9A-F]{6}$/.test(upper)) {
    return `#${upper}`
  }
  return null
}
