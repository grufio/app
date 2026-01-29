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
  return NextResponse.json({ error: message, ...extra }, { status })
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, res: jsonError("Unauthorized", 401, { stage: "auth" }) }
  return { ok: true as const, user }
}

