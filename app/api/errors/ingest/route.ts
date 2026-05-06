/**
 * API route: error event ingest.
 *
 * Counterpart to lib/monitoring/error-reporting.ts. The reporter posts here
 * when `NEXT_PUBLIC_ERROR_INGEST_URL` points to this route (e.g. set to
 * "/api/errors/ingest" or the absolute production URL). The handler logs
 * the structured payload via `console.error` so Vercel function logs / GCP
 * Logging captures it without a third-party SDK.
 *
 * Future: pipe to Sentry / Better Stack / a `error_events` Supabase table.
 */
import { NextResponse } from "next/server"

import { isUuid } from "@/lib/api/route-guards"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Per-IP token bucket so a malicious caller can't flood Vercel function
// logs. Module-scope is per-instance — Vercel may run many instances, but
// each rate-limits its own share. Good enough for a noise floor.
const BUCKET = new Map<string, { count: number; windowStart: number }>()
const MAX_EVENTS_PER_MINUTE = 60

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = BUCKET.get(ip)
  if (!entry || now - entry.windowStart > 60_000) {
    BUCKET.set(ip, { count: 1, windowStart: now })
    return false
  }
  entry.count += 1
  if (entry.count > MAX_EVENTS_PER_MINUTE) return true
  return false
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown"
  return req.headers.get("x-real-ip")?.trim() ?? "unknown"
}

type IngestPayload = {
  schemaVersion?: unknown
  timestamp?: unknown
  message?: unknown
  stack?: unknown
  name?: unknown
  digest?: unknown
  scope?: unknown
  code?: unknown
  stage?: unknown
  severity?: unknown
  context?: unknown
  tags?: unknown
  extra?: unknown
}

function sanitize(payload: IngestPayload): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (typeof payload.schemaVersion === "string") out.schemaVersion = payload.schemaVersion
  if (typeof payload.timestamp === "string") out.timestamp = payload.timestamp
  if (typeof payload.message === "string") out.message = payload.message.slice(0, 4000)
  if (typeof payload.stack === "string") out.stack = payload.stack.slice(0, 16000)
  if (typeof payload.name === "string") out.name = payload.name.slice(0, 200)
  if (typeof payload.digest === "string" && isUuid(payload.digest)) out.digest = payload.digest
  if (typeof payload.scope === "string") out.scope = payload.scope.slice(0, 50)
  if (typeof payload.code === "string") out.code = payload.code.slice(0, 100)
  if (typeof payload.stage === "string") out.stage = payload.stage.slice(0, 100)
  if (typeof payload.severity === "string") out.severity = payload.severity
  if (payload.context && typeof payload.context === "object") out.context = payload.context
  if (payload.tags && typeof payload.tags === "object") out.tags = payload.tags
  if (payload.extra && typeof payload.extra === "object") out.extra = payload.extra
  return out
}

export async function POST(req: Request) {
  const ip = clientIp(req)
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }
  const contentLength = req.headers.get("content-length")
  if (contentLength && Number(contentLength) > 32 * 1024) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 })
  }
  let payload: IngestPayload
  try {
    payload = (await req.json()) as IngestPayload
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }
  const event = sanitize(payload)
  if (!event.message) {
    return NextResponse.json({ error: "missing_message" }, { status: 400 })
  }
  // Vercel function logs / GCP Logging picks this up. Structured for
  // grep-ability — `clientIp` deliberately on its own field so log queries
  // can filter abusive sources.
  console.error("[error-ingest]", JSON.stringify({ ...event, clientIp: ip }))
  return new NextResponse(null, { status: 204 })
}
