/**
 * Minimal optional error reporting.
 *
 * Responsibilities:
 * - Provide a single `reportError` helper for client/server call sites.
 * - Keep behavior no-op by default (console only) unless env is configured.
 *
 * Notes:
 * - This intentionally avoids vendor SDKs; configure `NEXT_PUBLIC_ERROR_INGEST_URL`
 *   to receive JSON events in production.
 */

export type ErrorEvent = {
  schemaVersion: "v1"
  timestamp: string
  message: string
  stack?: string
  name?: string
  digest?: string
  scope?: "app" | "editor" | "api" | "server" | "client"
  code?: string
  stage?: string
  severity?: "error" | "warn"
  context?: Record<string, unknown>
  tags?: Record<string, string>
  extra?: Record<string, unknown>
}

function getIngestUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_ERROR_INGEST_URL
  if (!url) return null
  try {
    // Validate to avoid throwing inside callers.
    void new URL(url)
    return url
  } catch {
    return null
  }
}

/**
 * Logs the error locally and, when `NEXT_PUBLIC_ERROR_INGEST_URL` is set,
 * POSTs a structured `ErrorEvent` to the ingest endpoint. Best-effort:
 * never throws and never blocks the caller — fetch failures are swallowed.
 */
export async function reportError(
  error: unknown,
  event?: Omit<ErrorEvent, "message" | "stack" | "name" | "schemaVersion" | "timestamp">
) {
  const e = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error")
  const digestValue = (e as unknown as { digest?: unknown }).digest
  const payload: ErrorEvent = {
    schemaVersion: "v1",
    timestamp: new Date().toISOString(),
    message: e.message,
    stack: e.stack,
    name: e.name,
    digest: digestValue != null ? String(digestValue) : undefined,
    ...event,
  }

  // Always log locally.
  console.error("reportError:", payload)

  const ingestUrl = getIngestUrl()
  if (!ingestUrl) return

  try {
    await fetch(ingestUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      // avoid cached failures
      cache: "no-store",
    })
  } catch {
    // Best-effort; never throw from reporting.
  }
}

