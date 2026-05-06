/**
 * Route handler guard helpers.
 *
 * Responsibilities:
 * - Standardize error responses and UUID validation across API routes.
 * - Provide an auth check wrapper for Supabase-backed routes.
 */
import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Minimal route guard helpers for Supabase-backed Next.js Route Handlers.
 * Keeps API routes consistent and avoids copy/paste drift.
 */

/**
 * Builds a `NextResponse` JSON error with a normalised `{ error, stage, ... }`
 * shape and an optional `extra` payload. In production, leaks of internal
 * DB / storage errors are scrubbed to "Request failed" unless the stage is on
 * the allow-list (auth, validation, 401/403/404).
 */
export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  const stageFromExtra = (extra as { stage?: unknown } | undefined)?.stage
  const stage = typeof stageFromExtra === "string" && stageFromExtra.trim() ? stageFromExtra.trim() : "unknown"
  const safeMessage = (() => {
    // In production, avoid returning internal DB/storage error messages to clients.
    if (process.env.NODE_ENV !== "production") return message
    if (status === 401 || status === 403 || status === 404) return message
    if (stage === "auth" || stage === "auth_session" || stage === "rls_denied") return message
    if (stage.startsWith("validation")) return message
    return "Request failed"
  })()
  const rest = { ...(extra ?? {}) } as Record<string, unknown>
  delete rest.stage
  return NextResponse.json({ error: safeMessage, stage, ...rest }, { status })
}

/** Returns true if `value` is a v1-v5 UUID (matching Postgres' uuid type). */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

/**
 * Parses the request JSON body with a 256 KB default cap. Returns either
 * `{ ok: true, value }` or `{ ok: false, res: NextResponse }` so the
 * caller can early-return without try/catch.
 */
export async function readJson<T = unknown>(
  req: Request,
  opts?: { stage?: string; maxBytes?: number }
): Promise<{ ok: true; value: T } | { ok: false; res: NextResponse }> {
  // `Request.json()` has no size limit; apply a minimal guard for obvious bad inputs.
  const maxBytes = opts?.maxBytes ?? 256 * 1024
  const contentLength = req.headers.get("content-length")
  if (contentLength && Number(contentLength) > maxBytes) {
    return { ok: false, res: jsonError("Request too large", 413, { stage: opts?.stage ?? "json" }) }
  }
  try {
    const value = (await req.json()) as T
    return { ok: true, value }
  } catch {
    return { ok: false, res: jsonError("Invalid JSON", 400, { stage: opts?.stage ?? "json" }) }
  }
}

/**
 * Returns `{ ok: true, user }` for an authenticated session or
 * `{ ok: false, res }` with a 401 jsonError that the caller can return
 * directly. RLS still enforces ownership downstream — this guard exists
 * only to fail-fast with a structured error message.
 */
export async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, res: jsonError("Unauthorized", 401, { stage: "auth" }) }
  return { ok: true as const, user }
}

