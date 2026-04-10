/**
 * Project image repository helpers.
 *
 * Responsibilities:
 * - Provide query helpers for active and editor-target image rows.
 * - Keep image-role semantics consistent across callsites.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { computeDpiRelativePlacementPx, placementPxToMicroPx } from "@/lib/editor/image-placement"
import { pxUToPxNumber } from "@/lib/editor/units"
import { resolveImageKind } from "@/services/editor/server/image-kind"

export const PROJECT_IMAGES_BUCKET = "project_images"

type RawProjectImageRow = Record<string, unknown> & {
  updated_at?: string | null
  created_at?: string | null
}

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

export type ActiveProjectImageRow = {
  id: string
  name: string | null
  storage_bucket: string | null
  storage_path: string | null
  format: string | null
  width_px: number | null
  height_px: number | null
  file_size_bytes: number | null
  dpi: number | null
  source_image_id: string | null
  kind: string | null
  role: string | null
  is_locked: boolean | null
}

export function resolveImageStateRoleFromProjectImage(row: Pick<ActiveProjectImageRow, "role"> | null | undefined): "master" | "working" | "asset" {
  const role = String(row?.role ?? "").toLowerCase()
  if (role === "working") return "working"
  if (role === "asset") return "asset"
  return "master"
}

function toActiveProjectImageRow(data: Record<string, unknown>): ActiveProjectImageRow | null {
  if (!data?.id) return null
  return {
    id: String(data.id),
    name: data.name == null ? null : String(data.name),
    storage_bucket: data.storage_bucket == null ? null : String(data.storage_bucket),
    storage_path: data.storage_path == null ? null : String(data.storage_path),
    format: data.format == null ? null : String(data.format),
    width_px: data.width_px == null ? null : Number(data.width_px),
    height_px: data.height_px == null ? null : Number(data.height_px),
    file_size_bytes: data.file_size_bytes == null ? null : Number(data.file_size_bytes),
    dpi: data.dpi == null ? null : Number(data.dpi),
    source_image_id: data.source_image_id == null ? null : String(data.source_image_id),
    kind: data.kind == null ? null : String(data.kind),
    role: data.role == null ? null : String(data.role),
    is_locked: data.is_locked == null ? null : Boolean(data.is_locked),
  }
}

function rowSortTs(row: RawProjectImageRow): number {
  const updatedTs = Date.parse(String(row.updated_at ?? ""))
  if (Number.isFinite(updatedTs)) return updatedTs
  const createdTs = Date.parse(String(row.created_at ?? ""))
  if (Number.isFinite(createdTs)) return createdTs
  return 0
}

export async function resolveEditorTargetImageRows(
  supabase: SupabaseClient,
  projectId: string
): Promise<
  | {
      target: ActiveProjectImageRow | null
      preferredWorking: ActiveProjectImageRow | null
      error: null
    }
  | {
      target: null
      preferredWorking: null
      error: { stage: "active_lookup"; reason: string; code?: string }
    }
> {
  const { data, error } = await supabase
    .from("project_images")
    .select("id,name,storage_bucket,storage_path,format,width_px,height_px,file_size_bytes,dpi,source_image_id,kind,role,is_locked,updated_at,created_at")
    .eq("project_id", projectId)
    .is("deleted_at", null)

  if (error) {
    return {
      target: null,
      preferredWorking: null,
      error: {
        stage: "active_lookup",
        reason: error.message,
        code: (error as unknown as { code?: string })?.code,
      },
    }
  }

  const sortedRows = [...((data ?? []) as RawProjectImageRow[])].sort((a, b) => rowSortTs(b) - rowSortTs(a))
  const rows = sortedRows
    .map((row) => toActiveProjectImageRow(row as unknown as Record<string, unknown>))
    .filter((row): row is ActiveProjectImageRow => Boolean(row))
  const filterTarget = rows.find((row) => resolveImageKind(row) === "filter_working_copy") ?? null
  const preferredWorking = rows.find((row) => resolveImageKind(row) === "working_copy") ?? null
  const target = filterTarget ?? preferredWorking ?? null
  return { target, preferredWorking, error: null }
}

export async function getEditorTargetImageRow(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ row: ActiveProjectImageRow | null; error: null } | { row: null; error: { stage: "active_lookup"; reason: string; code?: string } }> {
  const resolved = await resolveEditorTargetImageRows(supabase, projectId)
  if (resolved.error) return { row: null, error: resolved.error }
  return { row: resolved.target, error: null }
}

export async function getActiveProjectImageRow(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ row: ActiveProjectImageRow | null; error: null } | { row: null; error: { stage: "active_lookup"; reason: string; code?: string } }> {
  const { data, error } = await supabase
    .from("project_images")
    .select("id,name,storage_bucket,storage_path,format,width_px,height_px,file_size_bytes,dpi,source_image_id,kind,role,is_locked")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle()

  if (error) {
    return {
      row: null,
      error: {
        stage: "active_lookup",
        reason: error.message,
        code: (error as unknown as { code?: string })?.code,
      },
    }
  }
  return { row: toActiveProjectImageRow(data as unknown as Record<string, unknown>), error: null }
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
