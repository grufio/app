/**
 * Project image repository helpers.
 *
 * Responsibilities:
 * - Provide query helpers for active and editor-target image rows.
 * - Keep image-role semantics consistent across callsites.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { resolveImageKind } from "@/lib/editor/image-kind"

export const PROJECT_IMAGES_BUCKET = "project_images"

type RawProjectImageRow = Record<string, unknown> & {
  updated_at?: string | null
  created_at?: string | null
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
  is_locked: boolean | null
}

export function resolveImageStateRoleFromProjectImage(row: Pick<ActiveProjectImageRow, "kind"> | null | undefined): "master" | "working" | "asset" {
  const kind = String(row?.kind ?? "").toLowerCase()
  if (kind === "working_copy") return "working"
  if (kind === "filter_working_copy") return "asset"
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
    .select("id,name,storage_bucket,storage_path,format,width_px,height_px,file_size_bytes,dpi,source_image_id,kind,is_locked,updated_at,created_at")
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
    .select("id,name,storage_bucket,storage_path,format,width_px,height_px,file_size_bytes,dpi,source_image_id,kind,is_locked")
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

export type ActiveProjectImageLockRow = {
  id: string
  is_locked: boolean | null
}

export async function getActiveProjectImageLockRow(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ row: ActiveProjectImageLockRow | null; error: null } | { row: null; error: { reason: string; code?: string } }> {
  const { data, error } = await supabase
    .from("project_images")
    .select("id,is_locked")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) {
    return {
      row: null,
      error: {
        reason: error.message,
        code: (error as unknown as { code?: string })?.code,
      },
    }
  }
  if (!data?.id) return { row: null, error: null }
  return {
    row: {
      id: String(data.id),
      is_locked: data.is_locked == null ? null : Boolean(data.is_locked),
    },
    error: null,
  }
}

export type ProjectWorkspacePlacementRow = {
  width_px_u?: string | null
  height_px_u?: string | null
  width_px?: number | null
  height_px?: number | null
  output_dpi?: number | null
}

export async function getProjectWorkspacePlacementRow(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ row: ProjectWorkspacePlacementRow | null; error: null } | { row: null; error: { reason: string; code?: string } }> {
  const { data, error } = await supabase
    .from("project_workspace")
    .select("width_px_u,height_px_u,width_px,height_px,output_dpi")
    .eq("project_id", projectId)
    .maybeSingle()

  if (error) {
    return {
      row: null,
      error: {
        reason: error.message,
        code: (error as unknown as { code?: string })?.code,
      },
    }
  }
  if (!data) return { row: null, error: null }
  return { row: data as ProjectWorkspacePlacementRow, error: null }
}

export async function setActiveProjectImageState(args: {
  supabase: SupabaseClient
  projectId: string
  imageId: string
  xPxU: string
  yPxU: string
  widthPxU: string
  heightPxU: string
}): Promise<{ ok: true } | { ok: false; status: number; stage: "active_switch"; reason: string; code?: string }> {
  const { supabase, projectId, imageId, xPxU, yPxU, widthPxU, heightPxU } = args
  const { error } = await supabase.rpc("set_active_master_with_state", {
    p_project_id: projectId,
    p_image_id: imageId,
    p_x_px_u: xPxU,
    p_y_px_u: yPxU,
    p_width_px_u: widthPxU,
    p_height_px_u: heightPxU,
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
    .select("id,storage_path,storage_bucket,name,width_px,height_px,kind,is_active,deleted_at")
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
