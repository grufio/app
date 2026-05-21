/**
 * Server-side helpers that flip the project's "active" image.
 *
 * Two flavours, picked by caller-context:
 *
 * - `activateProjectMasterAndWorkingCopy` — for the master upload flow.
 *   Computes a fresh DPI-relative placement, persists `initial_display_*`
 *   on the master row (immutable), and writes `project_image_state` at
 *   the working_copy.id with the same placement. Caller inserts both
 *   master + working_copy rows beforehand and passes both ids.
 *
 * - `activateProjectImageOnly` — for filter/trace/crop apply flows.
 *   Flips `is_active` for a non-master variant (filter_working_copy,
 *   trace_output, crop output). Does NOT touch `project_image_state`
 *   because state is anchored at working_copy.id (post the
 *   working-copy refactor) and the editor reads it from there
 *   regardless of which surface is rendered.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { computeImagePlacementPx, placementPxToMicroPx } from "@/lib/editor/image-placement"
import { pxUToPxNumber } from "@/lib/editor/units"
import {
  getActiveProjectImageLockRow,
  getProjectWorkspacePlacementRow,
  setActiveProjectImageOnly as setActiveProjectImageOnlyRpc,
  setActiveProjectImageState,
} from "@/lib/supabase/project-images"
import type { Database } from "@/lib/supabase/database.types"

function parsePositiveBigInt(value: unknown): bigint | null {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    const out = BigInt(value)
    return out > 0n ? out : null
  } catch {
    return null
  }
}

function resolveArtboardPx(workspace: {
  width_px_u?: string | null
  height_px_u?: string | null
  width_px?: number | null
  height_px?: number | null
}): { artW: number; artH: number } | null {
  const widthPxU = parsePositiveBigInt(workspace.width_px_u)
  const heightPxU = parsePositiveBigInt(workspace.height_px_u)
  const artW = widthPxU ? pxUToPxNumber(widthPxU) : Number(workspace.width_px ?? 0)
  const artH = heightPxU ? pxUToPxNumber(heightPxU) : Number(workspace.height_px ?? 0)
  if (!(artW > 0 && artH > 0)) return null
  return { artW, artH }
}

type ActivateError = { ok: false; status: number; stage: "active_switch" | "lock_conflict"; reason: string; code?: string }
type ActivateOk = { ok: true }

async function guardActiveLockNotHeldByOther(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  imageId: string
}): Promise<ActivateOk | ActivateError> {
  const activeLookup = await getActiveProjectImageLockRow(args.supabase, args.projectId)
  if (activeLookup.error) {
    return {
      ok: false,
      status: 400,
      stage: "active_switch",
      reason: activeLookup.error.reason,
      code: activeLookup.error.code,
    }
  }
  if (activeLookup.row?.is_locked && String(activeLookup.row.id) !== args.imageId) {
    return {
      ok: false,
      status: 409,
      stage: "lock_conflict",
      reason: "Active image is locked",
      code: "image_locked",
    }
  }
  return { ok: true }
}

/**
 * Master upload flow: write `initial_display_*` on the master row
 * (immutable upload-time placement, anchor for round-arrow restore)
 * AND seed `project_image_state` at the **working_copy.id** with the
 * same DPI-relative placement, AND flip is_active onto the working_copy.
 *
 * Per the user-model, the master is immutable after insert. All
 * editable display-state lives on the working_copy. Both rows are
 * passed in (caller inserts them before invoking).
 */
export async function activateProjectMasterAndWorkingCopy(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  masterImageId: string
  workingCopyImageId: string
  widthPx: number
  heightPx: number
  imageDpi?: number | null
}): Promise<ActivateOk | ActivateError> {
  const { supabase, projectId, masterImageId, workingCopyImageId, widthPx, heightPx, imageDpi } = args

  const lockGuard = await guardActiveLockNotHeldByOther({ supabase, projectId, imageId: workingCopyImageId })
  if (!lockGuard.ok) return lockGuard

  const workspaceLookup = await getProjectWorkspacePlacementRow(supabase, projectId)
  if (workspaceLookup.error || !workspaceLookup.row) {
    return {
      ok: false,
      status: 400,
      stage: "active_switch",
      reason: workspaceLookup.error?.reason ?? "Workspace missing",
      code: workspaceLookup.error?.code,
    }
  }

  const artboard = resolveArtboardPx(workspaceLookup.row)
  if (!artboard) {
    return {
      ok: false,
      status: 400,
      stage: "active_switch",
      reason: "Workspace size missing or invalid",
    }
  }

  const placement = computeImagePlacementPx({
    artW: artboard.artW,
    artH: artboard.artH,
    intrinsicW: Math.max(1, Math.trunc(widthPx)),
    intrinsicH: Math.max(1, Math.trunc(heightPx)),
    imageDpi,
  })
  if (!placement) {
    return {
      ok: false,
      status: 400,
      stage: "active_switch",
      reason: "Failed to compute initial placement",
    }
  }

  const placementU = placementPxToMicroPx(placement)

  // Persist the initial display rect on the master row. These columns
  // are immutable after this write — restore (round arrow) reads them
  // directly so the initial placement survives any later mutations on
  // `project_image_state` (= the working_copy state). Fail fast so we
  // never leave a master row with NULL/'0' initial_display_*
  // (= permanent restore inconsistency for that master).
  const { error: initialErr } = await supabase
    .from("project_images")
    .update({
      initial_display_x_px_u: placementU.xPxU,
      initial_display_y_px_u: placementU.yPxU,
      initial_display_width_px_u: placementU.widthPxU,
      initial_display_height_px_u: placementU.heightPxU,
    })
    .eq("id", masterImageId)
    .eq("project_id", projectId)
  if (initialErr) {
    return {
      ok: false,
      status: 400,
      stage: "active_switch",
      reason: `Failed to persist initial display rect: ${initialErr.message}`,
      code: (initialErr as { code?: string }).code,
    }
  }

  // Set the working_copy as active + write state row at working_copy.id.
  // Master row itself stays is_active=false; it is the immutable
  // source-of-truth, never the editor-active surface.
  return setActiveProjectImageState({
    supabase,
    projectId,
    imageId: workingCopyImageId,
    xPxU: placementU.xPxU,
    yPxU: placementU.yPxU,
    widthPxU: placementU.widthPxU,
    heightPxU: placementU.heightPxU,
  })
}

/**
 * Filter / trace / crop apply flows: flip `is_active` for a non-master
 * variant. State is anchored at master.id and stays untouched.
 */
export async function activateProjectImageOnly(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  imageId: string
}): Promise<ActivateOk | ActivateError> {
  const lockGuard = await guardActiveLockNotHeldByOther(args)
  if (!lockGuard.ok) return lockGuard
  return setActiveProjectImageOnlyRpc(args)
}
