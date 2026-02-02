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

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

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

export async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, res: jsonError("Unauthorized", 401, { stage: "auth" }) }
  return { ok: true as const, user }
}

