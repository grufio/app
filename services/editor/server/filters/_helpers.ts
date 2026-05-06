/**
 * Pure helpers shared by filter services (pixelate / lineart / numerate).
 *
 * The filter pipelines themselves call out to the Python service over HTTP and
 * are awkward to unit-test, but the IO-free pieces (input rounding, output
 * format negotiation) are testable on their own and ship from here so the
 * three callers stay in sync.
 */

export function toInt(value: number): number | null {
  if (!Number.isFinite(value)) return null
  const n = Math.round(value)
  if (n < 0) return null
  return n
}

export type OutputFormat = "jpeg" | "png" | "webp"

export function pickOutputFormat(format: string | null | undefined): OutputFormat {
  const f = String(format ?? "").toLowerCase()
  if (f === "jpg" || f === "jpeg") return "jpeg"
  if (f === "webp") return "webp"
  return "png"
}

export function contentTypeFor(format: OutputFormat): string {
  if (format === "jpeg") return "image/jpeg"
  if (format === "webp") return "image/webp"
  return "image/png"
}

/**
 * Builds the headers for a request to the Python filter service. When
 * `FILTER_SERVICE_TOKEN` is set, attaches `Authorization: Bearer <token>`
 * — the service's middleware enforces that header on every endpoint
 * except /health. Local-dev runs without the token and stay open.
 */
export function filterServiceHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const token = (process.env.FILTER_SERVICE_TOKEN ?? "").trim()
  if (token) headers["Authorization"] = `Bearer ${token}`
  return headers
}
