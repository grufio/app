/**
 * Server-side helpers that flip the project's "active" image.
 *
 * Two flavours, picked by caller-context:
 *
 * - `activateProjectMasterWithState` — for the master upload flow.
 *   Computes a fresh DPI-relative placement and writes a
 *   `project_image_state` row at the master.id. Use only when the
 *   incoming `imageId` is a `kind='master'` row.
 *
 * - `activateProjectImageOnly` — for filter/trace/crop apply flows.
 *   Flips `is_active` for a non-master variant (filter_working_copy,
 *   trace_output, crop output). Does NOT touch `project_image_state`
 *   because state is anchored at master.id (PR #124) and the editor
 *   reads it from there regardless of which surface is rendered.
 *
 * Splitting closes the C-D1 finding from the editor-stack review:
 * the old combined helper wrote junk state rows at non-master ids
 * that were never read.
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
 * Master upload flow: flip `is_active` AND seed a fresh
 * `project_image_state` row at master.id with a DPI-relative
 * placement. Caller MUST pass a `kind='master'` imageId.
 */
export async function activateProjectMasterWithState(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  imageId: string
  widthPx: number
  heightPx: number
  imageDpi?: number | null
}): Promise<ActivateOk | ActivateError> {
  const { supabase, projectId, imageId, widthPx, heightPx, imageDpi } = args

  const lockGuard = await guardActiveLockNotHeldByOther({ supabase, projectId, imageId })
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
  return setActiveProjectImageState({
    supabase,
    projectId,
    imageId,
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
