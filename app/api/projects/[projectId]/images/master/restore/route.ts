/**
 * API route: restore the editor's working_copy state to the master's
 * initial upload placement.
 *
 * The master row is immutable; its `initial_display_*` columns hold the
 * placement computed at upload time (`activate-project-image.ts`
 * persists them on insert and never updates them again). This route
 * reads those values and writes them as the new `project_image_state`
 * row at the working_copy.id (= the editable surface). Master itself
 * is untouched.
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, jsonError, requireUser } from "@/lib/api/route-guards"
import { resetProjectFilterChain } from "@/services/editor/server/filter-chain-reset"
import { resolveStateAnchorImage } from "@/lib/supabase/image-state"

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
    .select("id,initial_display_x_px_u,initial_display_y_px_u,initial_display_width_px_u,initial_display_height_px_u")
    .eq("project_id", projectId)
    .eq("kind", "master")
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

  // Resolve the state anchor (working_copy.id post-refactor; projects
  // without a working_copy are rejected as notFound — no master.id
  // fallback). Restore writes state to this image — the master row
  // itself stays immutable.
  const anchor = await resolveStateAnchorImage(supabase, projectId)
  if ("error" in anchor) return jsonError(anchor.error, 400, { stage: "anchor_lookup" })
  if ("notFound" in anchor) {
    return jsonError("Project has no master image", 404, { stage: "restore_anchor_missing" })
  }

  const { error: rpcErr } = await supabase.rpc("set_active_image_with_state", {
    p_project_id: projectId,
    p_image_id: anchor.id,
    p_x_px_u: baseMaster.initial_display_x_px_u,
    p_y_px_u: baseMaster.initial_display_y_px_u,
    p_width_px_u: baseMaster.initial_display_width_px_u,
    p_height_px_u: baseMaster.initial_display_height_px_u,
  })
  if (rpcErr) {
    return jsonError(rpcErr.message, 400, { stage: "restore_rpc" })
  }

  const filterReset = await resetProjectFilterChain({ supabase, projectId })
  if (!filterReset.ok) {
    return jsonError(filterReset.reason, 500, { stage: "filter_chain_reset", code: filterReset.code })
  }

  return NextResponse.json({ ok: true, image_id: anchor.id })
}
