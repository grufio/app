/**
 * API route: restore the editor's working_copy state to the master's
 * initial upload placement.
 *
 * The master row is immutable; its `initial_display_*` columns hold the
 * placement computed at upload time. This route reads those values and
 * writes them as the new `project_image_state` row at the
 * working_copy.id (= the editable surface). Master itself is untouched.
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, jsonError, requireUser } from "@/lib/api/route-guards"
import { resetProjectFilterChain } from "@/services/editor/server/filter-chain-reset"
import { computeImagePlacementPx, placementPxToMicroPx } from "@/lib/editor/image-placement"
import { pxUToPxNumber } from "@/lib/editor/units"
import { resolveStateAnchorImage } from "@/lib/supabase/image-state"

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
    .select("id,width_px,height_px,dpi,initial_display_x_px_u,initial_display_y_px_u,initial_display_width_px_u,initial_display_height_px_u")
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

  let xPxU = baseMaster.initial_display_x_px_u
  let yPxU = baseMaster.initial_display_y_px_u
  let widthPxU = baseMaster.initial_display_width_px_u
  let heightPxU = baseMaster.initial_display_height_px_u

  // Lazy backfill for legacy masters (uploaded before the
  // initial_display_* columns were populated — see
  // `20260521120114_project_images_initial_display.sql`). The columns
  // are NOT NULL DEFAULT '0'; treat '0' as "uninitialised".
  //
  // `computeImagePlacementPx` returns width/height purely from
  // intrinsic × (72/dpi), independent of the current artboard, so the
  // backfilled dimensions match what would have been written at upload
  // time. x/y land at the current artboard centre — fine because the
  // master row's "initial placement" anchor is the artboard centre by
  // contract, even if the artboard has since been resized.
  //
  // After the first restore on a legacy row, the master row is
  // persisted and future restores read directly (= the deterministic
  // path intended by the original migration).
  if (widthPxU === "0" || heightPxU === "0") {
    const { data: workspace, error: wsErr } = await supabase
      .from("project_workspace")
      .select("width_px_u,height_px_u")
      .eq("project_id", projectId)
      .maybeSingle()
    if (wsErr) {
      return jsonError(wsErr.message, 400, { stage: "restore_legacy_workspace_query" })
    }
    const artWPxU = parsePositiveBigInt(workspace?.width_px_u)
    const artHPxU = parsePositiveBigInt(workspace?.height_px_u)
    if (!artWPxU || !artHPxU) {
      return jsonError("Workspace size missing for legacy restore backfill", 400, { stage: "restore_legacy_workspace_invalid" })
    }
    const placement = computeImagePlacementPx({
      artW: pxUToPxNumber(artWPxU),
      artH: pxUToPxNumber(artHPxU),
      intrinsicW: Number(baseMaster.width_px ?? 0),
      intrinsicH: Number(baseMaster.height_px ?? 0),
      imageDpi: baseMaster.dpi == null ? null : Number(baseMaster.dpi),
    })
    if (!placement) {
      return jsonError("Failed to compute legacy backfill placement", 400, { stage: "restore_legacy_compute" })
    }
    const placementU = placementPxToMicroPx(placement)
    const { error: backfillErr } = await supabase
      .from("project_images")
      .update({
        initial_display_x_px_u: placementU.xPxU,
        initial_display_y_px_u: placementU.yPxU,
        initial_display_width_px_u: placementU.widthPxU,
        initial_display_height_px_u: placementU.heightPxU,
      })
      .eq("id", baseMaster.id)
      .eq("project_id", projectId)
    if (backfillErr) {
      return jsonError(`Failed to backfill initial display rect: ${backfillErr.message}`, 400, { stage: "restore_legacy_backfill" })
    }
    xPxU = placementU.xPxU
    yPxU = placementU.yPxU
    widthPxU = placementU.widthPxU
    heightPxU = placementU.heightPxU
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
    p_x_px_u: xPxU,
    p_y_px_u: yPxU,
    p_width_px_u: widthPxU,
    p_height_px_u: heightPxU,
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

