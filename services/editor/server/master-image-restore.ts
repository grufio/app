import type { SupabaseClient } from "@supabase/supabase-js"

import { computeDpiRelativePlacementPx, placementPxToMicroPx } from "@/lib/editor/image-placement"
import { pxUToPxNumber } from "@/lib/editor/units"

function parsePositiveBigInt(value: unknown): bigint | null {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    const out = BigInt(value)
    return out > 0n ? out : null
  } catch {
    return null
  }
}

export type RestoreInitialMasterResult =
  | { ok: true; imageId: string }
  | { ok: false; status: number; stage: string; reason: string; code?: string }

/**
 * Restore currently selected image state back to the initial uploaded master.
 */
export async function restoreInitialMasterImage(
  supabase: SupabaseClient,
  projectId: string
): Promise<RestoreInitialMasterResult> {
  const { data: activeImageRow, error: activeImageErr } = await supabase
    .from("project_images")
    .select("id,is_locked")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle()
  if (activeImageErr) {
    return { ok: false, status: 400, stage: "lock_guard_query", reason: activeImageErr.message, code: activeImageErr.code }
  }
  if (activeImageRow?.is_locked) {
    return { ok: false, status: 409, stage: "lock_conflict", reason: "Active image is locked", code: "image_locked" }
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
    return { ok: false, status: 400, stage: "restore_base_query", reason: baseErr.message, code: baseErr.code }
  }
  if (!baseMaster?.id) {
    return { ok: false, status: 404, stage: "restore_base_missing", reason: "Initial master image not found" }
  }

  const widthPx = Number(baseMaster.width_px ?? 0)
  const heightPx = Number(baseMaster.height_px ?? 0)
  if (!(widthPx > 0 && heightPx > 0)) {
    return { ok: false, status: 400, stage: "restore_base_invalid_dims", reason: "Invalid initial master dimensions" }
  }

  const { data: workspaceRow, error: workspaceErr } = await supabase
    .from("project_workspace")
    .select("width_px_u,height_px_u,width_px,height_px,output_dpi")
    .eq("project_id", projectId)
    .maybeSingle()
  if (workspaceErr) {
    return { ok: false, status: 400, stage: "restore_workspace_query", reason: workspaceErr.message, code: workspaceErr.code }
  }
  if (!workspaceRow) {
    return { ok: false, status: 400, stage: "restore_workspace_missing", reason: "Workspace missing" }
  }

  const widthPxU = parsePositiveBigInt(workspaceRow.width_px_u)
  const heightPxU = parsePositiveBigInt(workspaceRow.height_px_u)
  const artW = widthPxU ? pxUToPxNumber(widthPxU) : Number(workspaceRow.width_px ?? 0)
  const artH = heightPxU ? pxUToPxNumber(heightPxU) : Number(workspaceRow.height_px ?? 0)
  if (!(artW > 0 && artH > 0)) {
    return { ok: false, status: 400, stage: "restore_workspace_invalid_dims", reason: "Workspace size missing or invalid" }
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
    return { ok: false, status: 400, stage: "restore_placement", reason: "Failed to compute initial placement" }
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
    return { ok: false, status: 400, stage: "restore_rpc", reason: rpcErr.message, code: rpcErr.code }
  }

  return { ok: true, imageId: String(baseMaster.id) }
}
