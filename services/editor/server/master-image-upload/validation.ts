export function parseOptionalPositiveInt(value: string | undefined): number | null {
  if (typeof value !== "string" || !value.trim()) return null
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null
  return n
}

export function parseAllowedMimeList(value: string | undefined): Set<string> | null {
  if (typeof value !== "string" || !value.trim()) return null
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (!items.length) return null
  return new Set(items)
}

export function normalizePositiveInt(n: number): number | null {
  if (!Number.isFinite(n)) return null
  const v = Math.trunc(n)
  if (v <= 0) return null
  return v
}

export function resolveImageDpi(args: { dpiX: number | null; dpiY: number | null }): number {
  const { dpiX, dpiY } = args
  if (dpiX && dpiY) return Math.max(1, Math.round((dpiX + dpiY) / 2))
  if (dpiX) return Math.max(1, dpiX)
  if (dpiY) return Math.max(1, dpiY)
  return 72
}
