export type JsonRecord = Record<string, unknown>

export type FetchJsonResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: JsonRecord | null }

/**
 * Fetch JSON, returning a structured result.
 * - Never throws on non-2xx
 * - Returns `error: null` when the response body is not JSON
 */
export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<FetchJsonResult<T>> {
  const res = await fetch(input, init)
  const status = res.status

  const body = (await res.json().catch(() => null)) as unknown
  const json = (body && typeof body === "object" ? (body as JsonRecord) : null) as unknown

  if (!res.ok) {
    return { ok: false, status, error: (json as JsonRecord | null) ?? null }
  }
  return { ok: true, status, data: body as T }
}

