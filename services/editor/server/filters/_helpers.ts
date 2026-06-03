/**
 * Pure helpers shared by filter services (pixelate / lineart / bw).
 *
 * The filter pipelines themselves call out to the Python service over HTTP and
 * are awkward to unit-test, but the IO-free pieces (input rounding, output
 * format negotiation) are testable on their own and ship from here so the
 * callers stay in sync.
 */

export function toInt(value: number): number | null {
  if (!Number.isFinite(value)) return null
  const n = Math.round(value)
  if (n < 0) return null
  return n
}

/**
 * Shared shape for filter-pipeline results. The success branch is the
 * same for every HTTP-backed filter (one image written to storage);
 * the failure branch's `stage` discriminates by filter so callers can
 * tell *which* filter's process step blew up. The generic parameter is
 * the filter-specific process stage literal (`"pixelate_process"`,
 * `"lineart_process"`, ...).
 */
export type FilterFailStage<TProcess extends string> =
  | "validation"
  | "source_lookup"
  | "lock_conflict"
  | "source_download"
  | TProcess
  | "service_unavailable"
  | "auth"
  | "storage_upload"
  | "db_insert"
  | "transform_sync"
  | "active_switch"

export type FilterResult<TProcess extends string> =
  | { ok: true; id: string; storagePath: string; widthPx: number; heightPx: number }
  | { ok: false; status: number; stage: FilterFailStage<TProcess>; reason: string; code?: string }

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
 * The success branch is parameterised on the `responseKind` passed to
 * `callFilterService`, so callers get either `{ bytes }` (default,
 * for image-out endpoints) or `{ json }` (pixelate's SVG+bitmap
 * envelope) without runtime narrowing dances.
 *
 * - `ok: true` with `bytes` — service returned 2xx with rendered image bytes
 *   (the default; used by every image-out endpoint).
 * - `ok: true` with `json` — service returned 2xx with a JSON envelope
 *   (pixelate returns `{svg, cropped_png_b64, region_count}` so the caller
 *   can split the SVG and the cropped bitmap into separate storage rows).
 * - `service_unavailable` — service was unreachable / 502/503/504 / timed out
 *   across all attempts. Surface this stage so the UI can show a "service
 *   temporarily unavailable" message instead of a raw 500.
 * - `auth` — 401 from the service (token mismatch or missing). Not retried.
 * - `filter_failed` — terminal 4xx or 500 with a payload error from the
 *   service. Includes the upstream reason so the UI can decide whether to
 *   retry.
 */
export type CallFilterServiceFailure = {
  ok: false
  status: number
  stage: "service_unavailable" | "filter_failed" | "auth"
  reason: string
}
export type CallFilterServiceBytesSuccess = { ok: true; bytes: ArrayBuffer; phases?: string }
export type CallFilterServiceJsonSuccess = { ok: true; json: unknown; phases?: string }
export type CallFilterServiceResult<R extends "bytes" | "json" = "bytes"> =
  | (R extends "json" ? CallFilterServiceJsonSuccess : CallFilterServiceBytesSuccess)
  | CallFilterServiceFailure

/**
 * Phase-timing helper for filter pipelines (F18).
 *
 * Off by default; flips on when `PROFILE_FILTERS=1` (or `true`) is set
 * in the env. When on, it returns a timer that records per-phase
 * deltas and, on `.report(filterId, extra?)`, emits a single JSON line
 * to stdout the profile script (`scripts/profile-filters.mjs`)
 * collects. When off, every method is a cheap no-op so production
 * paths stay free of monitoring overhead.
 *
 * Production never sets `PROFILE_FILTERS` (Vercel build env doesn't
 * carry the var), so the prod code path is the NOOP_PROFILER constant
 * — the live-timer branch only fires under local `PROFILE_FILTERS=1
 * npm run dev` or the profile script. No runtime cost in prod.
 */
type FilterProfiler = {
  mark: (phase: string) => void
  report: (filterId: string, extra?: Record<string, unknown>) => void
}

const PROFILE_FILTERS_ON = ["1", "true"].includes((process.env.PROFILE_FILTERS ?? "").toLowerCase())

const NOOP_PROFILER: FilterProfiler = {
  mark: () => {},
  report: () => {},
}

export function startFilterProfiler(): FilterProfiler {
  if (!PROFILE_FILTERS_ON) return NOOP_PROFILER
  const t0 = performance.now()
  let last = t0
  const phases: Array<{ name: string; ms: number }> = []
  return {
    mark(phase) {
      const now = performance.now()
      phases.push({ name: phase, ms: now - last })
      last = now
    },
    report(filterId, extra) {
      const total = performance.now() - t0
      const out = {
        kind: "filter-profile",
        filter: filterId,
        total_ms: Number(total.toFixed(1)),
        phases: phases.map((p) => ({ ...p, ms: Number(p.ms.toFixed(1)) })),
        ...extra,
      }
      console.log(JSON.stringify(out))
    },
  }
}

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
export async function callFilterService<R extends "bytes" | "json" = "bytes">(opts: {
  path: string
  body: unknown
  timeoutMs?: number
  maxAttempts?: number
  /** `"bytes"` (default) returns the raw response body as an
   * ArrayBuffer; `"json"` parses it as JSON and returns the parsed
   * value. The filter service returns image bytes from every legacy
   * endpoint and a JSON envelope from `/filters/pixelate` (which
   * pairs the SVG with the cropped source bitmap). */
  responseKind?: R
  /** Test seam: replaces global fetch + sleep when set. */
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}): Promise<CallFilterServiceResult<R>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxAttempts = Math.max(1, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)
  const responseKind = opts.responseKind ?? "bytes"
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
      const phases = res.headers.get("X-Profile-Phases") ?? undefined
      if (responseKind === "json") {
        const json = await res.json()
        return { ok: true, json, phases } as CallFilterServiceResult<R>
      }
      const bytes = await res.arrayBuffer()
      return { ok: true, bytes, phases } as CallFilterServiceResult<R>
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
