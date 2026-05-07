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

/**
 * Result of a filter-service call after retry/fallback handling.
 *
 * - `ok: true` — service returned 2xx with the rendered image bytes.
 * - `service_unavailable` — service was unreachable / 502/503/504 / timed out
 *   across all attempts. Surface this stage so the UI can show a "service
 *   temporarily unavailable" message instead of a raw 500.
 * - `auth` — 401 from the service (token mismatch or missing). Not retried.
 * - `filter_failed` — terminal 4xx or 500 with a payload error from the
 *   service. Includes the upstream reason so the UI can decide whether to
 *   retry.
 */
export type CallFilterServiceResult =
  | { ok: true; bytes: ArrayBuffer }
  | { ok: false; status: number; stage: "service_unavailable" | "filter_failed" | "auth"; reason: string }

/** Decision: should this fetch outcome be retried? Pure for unit testing. */
export function isTransientFilterServiceFailure(input: {
  /** Set when fetch threw (network, timeout abort) — null/undefined when HTTP returned. */
  fetchError?: Error | null
  /** HTTP status when fetch returned — undefined when fetchError is set. */
  status?: number
}): boolean {
  if (input.fetchError) return true
  const s = input.status
  if (s == null) return false
  // 502/503/504 are the canonical transient indicators (cold-start, gateway,
  // timeout, overloaded). Any other status is treated as terminal — retrying
  // a 400 or 401 won't change the outcome.
  return s === 502 || s === 503 || s === 504
}

/** Decision: how long should attempt N+1 wait before firing? Pure. */
export function backoffDelayMs(attempt: number): number {
  // 0-indexed attempt of the *next* try (so 0 = wait before second attempt).
  // Doubles, capped at 4s — enough to clear a Cloud Run cold-start without
  // making the worst case unreasonable for the user.
  if (attempt < 0) return 0
  const base = 250 * Math.pow(2, attempt)
  return Math.min(base, 4000)
}

const FILTER_SERVICE_BASE_URL = process.env.FILTER_SERVICE_URL || "http://localhost:8001"
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_ATTEMPTS = 3

/**
 * Calls a filter-service endpoint with timeout + retry on transient failures.
 *
 * Retries 502/503/504 and network errors up to `maxAttempts` total. 4xx and
 * non-transient 5xx are returned immediately. On final failure the result
 * surfaces a `service_unavailable` stage so the UI can show a friendly
 * "Filter service is temporarily unavailable" instead of a raw 500.
 */
export async function callFilterService(opts: {
  path: string
  body: unknown
  timeoutMs?: number
  maxAttempts?: number
  /** Test seam: replaces global fetch + sleep when set. */
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}): Promise<CallFilterServiceResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxAttempts = Math.max(1, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)
  const fetchImpl = opts.fetchImpl ?? fetch
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  const url = `${FILTER_SERVICE_BASE_URL}${opts.path}`
  const headers = filterServiceHeaders()
  const bodyText = JSON.stringify(opts.body)

  let lastReason = ""
  let lastStatus = 0

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response | null = null
    let fetchError: Error | null = null
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers,
        body: bodyText,
        signal: controller.signal,
      })
    } catch (e) {
      fetchError = e instanceof Error ? e : new Error(String(e))
    } finally {
      clearTimeout(timer)
    }

    if (res?.ok) {
      const bytes = await res.arrayBuffer()
      return { ok: true, bytes }
    }

    if (res && res.status === 401) {
      const text = await res.text().catch(() => "")
      return {
        ok: false,
        status: 401,
        stage: "auth",
        reason: text || "Filter service rejected the request token.",
      }
    }

    const transient = isTransientFilterServiceFailure({
      fetchError,
      status: res?.status,
    })

    if (!transient && res) {
      // Terminal HTTP failure — return the upstream reason verbatim.
      const text = await res.text().catch(() => "")
      return {
        ok: false,
        status: res.status,
        stage: "filter_failed",
        reason: text || `Filter service returned HTTP ${res.status}`,
      }
    }

    lastReason = fetchError
      ? fetchError.name === "AbortError"
        ? `Filter service timed out after ${timeoutMs} ms`
        : fetchError.message
      : `Filter service returned HTTP ${res?.status}`
    lastStatus = res?.status ?? 0

    const isLastAttempt = attempt === maxAttempts - 1
    if (!isLastAttempt) {
      await sleep(backoffDelayMs(attempt))
    }
  }

  return {
    ok: false,
    status: lastStatus || 503,
    stage: "service_unavailable",
    reason: lastReason || "Filter service is temporarily unavailable. Please try again.",
  }
}
