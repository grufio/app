/**
 * API route: project resource operations.
 *
 * Responsibilities:
 * - Handle project deletion (owner-only via auth/RLS).
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, jsonError, requireUser } from "@/lib/api/route-guards"

export const dynamic = "force-dynamic"

export async function DELETE(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const supabase = await createSupabaseServerClient()
  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  const { projectId } = await params
  if (!isUuid(String(projectId))) return jsonError("Invalid projectId", 400, { stage: "params" })

  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("owner_id", u.user.id)
    .select("id")
    .maybeSingle()

  if (error) return jsonError(error.message, 400, { stage: "delete_project" })
  if (!data?.id) return jsonError("Not found", 404, { stage: "delete_project" })

  return NextResponse.json({ ok: true })
}

