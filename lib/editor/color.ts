/**
 * Color utilities (UI-agnostic).
 *
 * Responsibilities:
 * - Convert hex colors + opacity into an RGBA CSS style object.
 * - Preserve existing validation/clamping behavior.
 */
export function computeRgbaBackgroundStyleFromHex(opts: {
  enabled: boolean
  hex: string
  opacityPercent: number
}): { backgroundColor: string } | undefined {
  if (!opts.enabled) return undefined
  const hex = opts.hex.trim()
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) return undefined
  const int = Number.parseInt(m[1], 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  const a = Math.max(0, Math.min(100, opts.opacityPercent)) / 100
  return { backgroundColor: `rgba(${r}, ${g}, ${b}, ${a})` }
}

