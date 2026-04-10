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
import { computeDpiRelativePlacementPx, placementPxToMicroPx } from "@/lib/editor/image-placement"
import { pxUToPxNumber } from "@/lib/editor/units"

export const dynamic = "force-dynamic"

function parsePositiveBigInt(value: unknown): bigint | null {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    const out = BigInt(value)
    return out > 0n ? out : null
  } catch {
    return null
  }
}

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
    .select("id,width_px,height_px,dpi")
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

  const widthPx = Number(baseMaster.width_px ?? 0)
  const heightPx = Number(baseMaster.height_px ?? 0)
  if (!(widthPx > 0 && heightPx > 0)) {
    return jsonError("Invalid initial master dimensions", 400, { stage: "restore_base_invalid_dims" })
  }

  const { data: workspaceRow, error: workspaceErr } = await supabase
    .from("project_workspace")
    .select("width_px_u,height_px_u,width_px,height_px,output_dpi")
    .eq("project_id", projectId)
    .maybeSingle()
  if (workspaceErr) {
    return jsonError(workspaceErr.message, 400, { stage: "restore_workspace_query" })
  }
  if (!workspaceRow) {
    return jsonError("Workspace missing", 400, { stage: "restore_workspace_missing" })
  }

  const widthPxU = parsePositiveBigInt(workspaceRow.width_px_u)
  const heightPxU = parsePositiveBigInt(workspaceRow.height_px_u)
  const artW = widthPxU ? pxUToPxNumber(widthPxU) : Number(workspaceRow.width_px ?? 0)
  const artH = heightPxU ? pxUToPxNumber(heightPxU) : Number(workspaceRow.height_px ?? 0)
  if (!(artW > 0 && artH > 0)) {
    return jsonError("Workspace size missing or invalid", 400, { stage: "restore_workspace_invalid_dims" })
  }

  const placement = computeDpiRelativePlacementPx({
    artW,
    artH,
    intrinsicW: Math.max(1, Math.trunc(widthPx)),
    intrinsicH: Math.max(1, Math.trunc(heightPx)),
    artboardDpi: Number(workspaceRow.output_dpi),
    imageDpi: Number(baseMaster.dpi ?? 0),
  })
  if (!placement) {
    return jsonError("Failed to compute initial placement", 400, { stage: "restore_placement" })
  }
  const placementU = placementPxToMicroPx(placement)

  const { error: rpcErr } = await supabase.rpc("set_active_master_with_state", {
    p_project_id: projectId,
    p_image_id: baseMaster.id,
    p_x_px_u: placementU.xPxU,
    p_y_px_u: placementU.yPxU,
    p_width_px_u: placementU.widthPxU,
    p_height_px_u: placementU.heightPxU,
  })
  if (rpcErr) {
    return jsonError(rpcErr.message, 400, { stage: "restore_rpc" })
  }

  return NextResponse.json({ ok: true, image_id: String(baseMaster.id) })
}

