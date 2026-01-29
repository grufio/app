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
  message: string
  stack?: string
  name?: string
  digest?: string
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

export async function reportError(error: unknown, event?: Omit<ErrorEvent, "message" | "stack" | "name">) {
  const e = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error")
  const payload: ErrorEvent = {
    message: e.message,
    stack: e.stack,
    name: e.name,
    digest: (e as { digest?: unknown })?.digest != null ? String((e as { digest: unknown }).digest) : undefined,
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

