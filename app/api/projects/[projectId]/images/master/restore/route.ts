/**
 * API route: restore active image to initial uploaded master.
 *
 * Responsibilities:
 * - Resolve the initial master image for the project (earliest role='master').
 * - Activate it and reset persisted image state in one DB operation.
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, jsonError, requireUser } from "@/lib/api/route-guards"

export const dynamic = "force-dynamic"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })
  }
  const supabase = await createSupabaseServerClient()

  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  // Explicit access check for clearer staged errors (RLS still enforces).
  const { data: projectRow, error: projectErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle()
  if (projectErr) {
    return jsonError("Failed to verify project access", 400, { stage: "project_access" })
  }
  if (!projectRow?.id) {
    return jsonError("Forbidden (project not accessible)", 403, { stage: "rls_denied", where: "project_access" })
  }

  const { data: activeImageRow, error: activeImageErr } = await supabase
    .from("project_images")
    .select("id,is_locked")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle()
  if (activeImageErr) {
    return jsonError(activeImageErr.message, 400, { stage: "lock_guard_query" })
  }
  if (activeImageRow?.is_locked) {
    return jsonError("Active image is locked", 409, { stage: "lock_conflict", reason: "image_locked" })
  }

  const { data: baseMaster, error: baseErr } = await supabase
    .from("project_images")
    .select("id,width_px,height_px")
    .eq("project_id", projectId)
    .eq("role", "master")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (baseErr) {
    return jsonError(baseErr.message, 400, { stage: "restore_base_query" })
  }
  if (!baseMaster?.id) {
    return jsonError("Initial master image not found", 404, { stage: "restore_base_missing" })
  }

  const widthPx = Number(baseMaster.width_px ?? 0)
  const heightPx = Number(baseMaster.height_px ?? 0)
  if (!(widthPx > 0 && heightPx > 0)) {
    return jsonError("Invalid initial master dimensions", 400, { stage: "restore_base_invalid_dims" })
  }

  const { error: rpcErr } = await supabase.rpc("set_active_master_with_state", {
    p_project_id: projectId,
    p_image_id: baseMaster.id,
    p_width_px: Math.round(widthPx),
    p_height_px: Math.round(heightPx),
  })
  if (rpcErr) {
    return jsonError(rpcErr.message, 400, { stage: "restore_rpc" })
  }

  return NextResponse.json({ ok: true, image_id: String(baseMaster.id) })
}

