import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Minimal route guard helpers for Supabase-backed Next.js Route Handlers.
 * Keeps API routes consistent and avoids copy/paste drift.
 */

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status })
}

export async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, res: jsonError("Unauthorized", 401, { stage: "auth" }) }
  return { ok: true as const, user }
}

export async function requireProjectAccess(supabase: SupabaseClient, projectId: string) {
  const { data: projectRow, error: projectErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single()

  if (projectErr || !projectRow) {
    return { ok: false as const, res: jsonError("Forbidden (project not accessible)", 403, { stage: "project_access" }) }
  }

  return { ok: true as const }
}

