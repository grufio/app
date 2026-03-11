/**
 * Project image repository helpers.
 *
 * Responsibilities:
 * - Provide a single query helper for the active image row.
 * - Keep active-image filter semantics consistent across callsites.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export const PROJECT_IMAGES_BUCKET = "project_images"
const DEFAULT_IMAGE_DPI = 72

function normalizeImageDpi(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return DEFAULT_IMAGE_DPI
  return Math.max(1, Math.trunc(value))
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

  const { error } = await supabase.rpc("set_active_master_with_state", {
    p_project_id: projectId,
    p_image_id: imageId,
    p_width_px: Math.max(1, Math.trunc(widthPx)),
    p_height_px: Math.max(1, Math.trunc(heightPx)),
    p_image_dpi: normalizeImageDpi(imageDpi),
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

