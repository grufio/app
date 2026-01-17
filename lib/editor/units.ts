export type Unit = "mm" | "cm" | "pt" | "px"

/**
 * Convert a physical length value to pixels using DPI.
 * - mm/cm/pt are treated as physical units
 * - px is identity
 */
export function unitToPx(value: number, unit: Unit, dpi: number): number {
  if (!Number.isFinite(value)) return 0
  if (!Number.isFinite(dpi) || dpi <= 0) return 0
  if (unit === "px") return value
  if (unit === "mm") return (value / 25.4) * dpi
  if (unit === "cm") return (value / 2.54) * dpi
  if (unit === "pt") return (value / 72) * dpi
  return value
}

/**
 * Convert pixels to a physical length value using DPI.
 */
export function pxToUnit(px: number, unit: Unit, dpi: number): number {
  if (!Number.isFinite(px)) return 0
  if (!Number.isFinite(dpi) || dpi <= 0) return 0
  if (unit === "px") return px
  const inches = px / dpi
  if (unit === "mm") return inches * 25.4
  if (unit === "cm") return inches * 2.54
  if (unit === "pt") return inches * 72
  return px
}

/**
 * Round a pixel dimension to a safe positive integer.
 */
export function clampPx(px: number): number {
  if (!Number.isFinite(px)) return 1
  return Math.max(1, Math.round(px))
}

/**
 * Clamp a pixel dimension to a safe positive number, but keep decimals.
 * This avoids value drift when converting unit <-> px repeatedly.
 */
export function clampPxFloat(px: number): number {
  if (!Number.isFinite(px)) return 1
  return Math.max(1, px)
}

/**
 * Format a number for compact UI inputs (max 4 decimals, trims trailing zeros).
 */
export function fmt4(n: number): string {
  if (!Number.isFinite(n)) return ""
  return n.toFixed(4).replace(/\.?0+$/, "")
}

/**
 * Snap a number to its nearest integer when it's extremely close.
 * Useful for display-only formatting to avoid "199.9999" flicker/drift.
 */
export function snapNearInt(n: number, eps = 1e-3): number {
  if (!Number.isFinite(n)) return n
  const r = Math.round(n)
  return Math.abs(n - r) <= eps ? r : n
}

/**
 * Format a number for compact UI inputs (max 2 decimals, trims trailing zeros).
 */
export function fmt2(n: number): string {
  if (!Number.isFinite(n)) return ""
  return n.toFixed(2).replace(/\.?0+$/, "")
}

