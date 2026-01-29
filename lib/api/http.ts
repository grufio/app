export type JsonRecord = Record<string, unknown>

export type FetchJsonResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: JsonRecord | null }

// Very small in-memory dedup/cache for client-side GET requests.
// Goal: avoid mount waterfalls and duplicate fetches when multiple hooks request the same endpoint.
// Notes:
// - This is per-tab (module scope) and best-effort only.
// - We only cache successful GETs for a short TTL; non-2xx results are not cached.
const GET_TTL_MS = 2_000
const inflight = new Map<string, Promise<FetchJsonResult<unknown>>>()
const cache = new Map<string, { at: number; value: FetchJsonResult<unknown> }>()

function isGet(init?: RequestInit): boolean {
  const m = (init?.method ?? "GET").toUpperCase()
  return m === "GET"
}

function cacheKey(input: RequestInfo | URL, init?: RequestInit): string {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url
  const m = (init?.method ?? "GET").toUpperCase()
  // Credentials can matter for auth'd endpoints.
  const cred = init?.credentials ?? ""
  return `${m}:${cred}:${url}`
}

/**
 * Fetch JSON, returning a structured result.
 * - Never throws on non-2xx
 * - Returns `error: null` when the response body is not JSON
 */
export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<FetchJsonResult<T>> {
  const key = isGet(init) ? cacheKey(input, init) : null
  if (key) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at <= GET_TTL_MS) return hit.value as FetchJsonResult<T>
    const p = inflight.get(key)
    if (p) return (await p) as FetchJsonResult<T>
  }

  const run = async () => {
    const res = await fetch(input, init)
    const status = res.status

    const body = (await res.json().catch(() => null)) as unknown
    const json = (body && typeof body === "object" ? (body as JsonRecord) : null) as unknown

    if (!res.ok) {
      return { ok: false, status, error: (json as JsonRecord | null) ?? null } as FetchJsonResult<unknown>
    }
    return { ok: true, status, data: body as unknown } as FetchJsonResult<unknown>
  }

  const promise = run()
  if (key) inflight.set(key, promise)
  const out = await promise
  if (key) {
    inflight.delete(key)
    if (out.ok) cache.set(key, { at: Date.now(), value: out })
  }
  return out as FetchJsonResult<T>
}

