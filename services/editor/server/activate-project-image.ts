import type { SupabaseClient } from "@supabase/supabase-js"

import { computeDpiRelativePlacementPx, placementPxToMicroPx } from "@/lib/editor/image-placement"
import { pxUToPxNumber } from "@/lib/editor/units"
import {
  getActiveProjectImageLockRow,
  getProjectWorkspacePlacementRow,
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

export async function activateProjectImage(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  imageId: string
  widthPx: number
  heightPx: number
  imageDpi?: number | null
}): Promise<{ ok: true } | { ok: false; status: number; stage: "active_switch" | "lock_conflict"; reason: string; code?: string }> {
  const { supabase, projectId, imageId, widthPx, heightPx, imageDpi } = args

  const activeLookup = await getActiveProjectImageLockRow(supabase, projectId)
  if (activeLookup.error) {
    return {
      ok: false,
      status: 400,
      stage: "active_switch",
      reason: activeLookup.error.reason,
      code: activeLookup.error.code,
    }
  }
  if (activeLookup.row?.is_locked && String(activeLookup.row.id) !== imageId) {
    return {
      ok: false,
      status: 409,
      stage: "lock_conflict",
      reason: "Active image is locked",
      code: "image_locked",
    }
  }

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

  const placement = computeDpiRelativePlacementPx({
    artW: artboard.artW,
    artH: artboard.artH,
    intrinsicW: Math.max(1, Math.trunc(widthPx)),
    intrinsicH: Math.max(1, Math.trunc(heightPx)),
    artboardDpi: Number(workspaceLookup.row.output_dpi),
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
