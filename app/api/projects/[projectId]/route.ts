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
  if (!isUuid(String(projectId))) return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })

  // Use the atomic RPC: deletes project_image_filters first, then the
  // project (cascade handles the rest). Going through `.delete()` directly
  // hits a RESTRICT FK from filter rows to images while images are being
  // cascade-deleted, aborting with 23503 even though filters are *also*
  // cascading.
  const { data, error } = await supabase.rpc("delete_project", { p_project_id: projectId })

  if (error) {
    // PGRST / PostgREST surfaces P0002 (not found) from the RPC body.
    const code = (error as { code?: string }).code ?? ""
    if (code === "P0002" || /not found/i.test(error.message ?? "")) {
      return jsonError("Not found", 404, { stage: "delete_project", code })
    }
    return jsonError(error.message, 400, { stage: "delete_project", code })
  }
  if (!data) return jsonError("Not found", 404, { stage: "delete_project" })

  return NextResponse.json({ ok: true })
}

