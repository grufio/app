/**
 * Project image repository helpers.
 *
 * Responsibilities:
 * - Provide a single query helper for the active image row.
 * - Keep active-image filter semantics consistent across callsites.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { computeDpiRelativePlacementPx, placementPxToMicroPx } from "@/lib/editor/image-placement"
import { pxUToPxNumber } from "@/lib/editor/units"

export const PROJECT_IMAGES_BUCKET = "project_images"

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

export type ActiveMasterImage = {
  id: string
  storagePath: string
  storageBucket: string
  name: string
  widthPx: number
  heightPx: number
}

export async function getActiveMasterImageId(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ imageId: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("project_images")
    .select("id")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle()

  if (error) return { imageId: null, error: error.message }
  if (!data?.id) return { imageId: null, error: null }
  return { imageId: String(data.id), error: null }
}

export async function activateMasterWithState(args: {
  supabase: SupabaseClient
  projectId: string
  imageId: string
  widthPx: number
  heightPx: number
  imageDpi?: number | null
}): Promise<{ ok: true } | { ok: false; status: number; stage: "active_switch" | "lock_conflict"; reason: string; code?: string }> {
  const { supabase, projectId, imageId, widthPx, heightPx, imageDpi } = args
  const { data: activeRow, error: activeErr } = await supabase
    .from("project_images")
    .select("id,is_locked")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle()
  if (activeErr) {
    return {
      ok: false,
      status: 400,
      stage: "active_switch",
      reason: activeErr.message,
      code: (activeErr as unknown as { code?: string })?.code,
    }
  }
  if (activeRow?.is_locked && String(activeRow.id) !== imageId) {
    return {
      ok: false,
      status: 409,
      stage: "lock_conflict",
      reason: "Active image is locked",
      code: "image_locked",
    }
  }

  const { data: workspaceRow, error: workspaceErr } = await supabase
    .from("project_workspace")
    .select("width_px_u,height_px_u,width_px,height_px,output_dpi")
    .eq("project_id", projectId)
    .maybeSingle()

  if (workspaceErr || !workspaceRow) {
    return {
      ok: false,
      status: 400,
      stage: "active_switch",
      reason: workspaceErr?.message ?? "Workspace missing",
      code: (workspaceErr as unknown as { code?: string } | null)?.code,
    }
  }

  const artboard = resolveArtboardPx(workspaceRow)
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
    artboardDpi: Number(workspaceRow.output_dpi),
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

  const { error } = await supabase.rpc("set_active_master_with_state", {
    p_project_id: projectId,
    p_image_id: imageId,
    p_x_px_u: placementU.xPxU,
    p_y_px_u: placementU.yPxU,
    p_width_px_u: placementU.widthPxU,
    p_height_px_u: placementU.heightPxU,
  })
  if (error) {
    return {
      ok: false,
      status: 400,
      stage: "active_switch",
      reason: error.message,
      code: (error as unknown as { code?: string })?.code,
    }
  }
  return { ok: true }
}

export async function getActiveMasterImage(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ image: ActiveMasterImage | null; error: string | null }> {
  const { data, error } = await supabase
    .from("project_images")
    .select("id,storage_path,storage_bucket,name,width_px,height_px,role,is_active,deleted_at")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle()

  if (error) return { image: null, error: error.message }
  if (!data?.storage_path) return { image: null, error: null }

  const widthPxRaw = Number(data.width_px)
  const heightPxRaw = Number(data.height_px)
  const widthPx = Number.isFinite(widthPxRaw) ? widthPxRaw : 0
  const heightPx = Number.isFinite(heightPxRaw) ? heightPxRaw : 0

  return {
    image: {
      id: String(data.id ?? ""),
      storagePath: data.storage_path,
      storageBucket: data.storage_bucket ?? PROJECT_IMAGES_BUCKET,
      name: data.name ?? "master image",
      widthPx,
      heightPx,
    },
    error: null,
  }
}
