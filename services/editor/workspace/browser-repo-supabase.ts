/**
 * Supabase-backed repository for editor workspace (browser).
 *
 * Responsibilities:
 * - Read/write `project_workspace` in the browser using Supabase PostgREST.
 * - Keep the select list centralized to avoid drift.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import type { WorkspaceRow } from "./types"

const SELECT_WORKSPACE =
  "project_id,unit,width_value,height_value,output_dpi,width_px_u,height_px_u,width_px,height_px,raster_effects_preset,page_bg_enabled,page_bg_color,page_bg_opacity"

function hasOwn(o: unknown, key: string): boolean {
  return Boolean(o) && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, key)
}

function findForbiddenKey(o: unknown, keys: readonly string[]): string | null {
  for (const k of keys) {
    if (hasOwn(o, k)) return k
  }
  return null
}

function mapWorkspaceDbError(message: string, stage: "select" | "insert" | "update"): string {
  const lower = message.toLowerCase()
  if (lower.includes("project_workspace_width_px_u_positive") || lower.includes("project_workspace_height_px_u_positive")) {
    return `[${stage}] workspace_size_out_of_range: ${message}`
  }
  if (lower.includes("project_workspace_px_cache_consistency")) {
    return `[${stage}] workspace_px_cache_mismatch: ${message}`
  }
  if (lower.includes("requires width_px_u and height_px_u")) {
    return `[${stage}] workspace_missing_canonical_px_u: ${message}`
  }
  return `[${stage}] ${message}`
}

export async function selectWorkspace(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ row: WorkspaceRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("project_workspace")
    .select(SELECT_WORKSPACE)
    .eq("project_id", projectId)
    .maybeSingle()
  if (error) return { row: null, error: mapWorkspaceDbError(error.message, "select") }
  return { row: (data as unknown as WorkspaceRow) ?? null, error: null }
}

export async function insertWorkspace(
  supabase: SupabaseClient,
  row: WorkspaceRow
): Promise<{ row: WorkspaceRow | null; error: string | null }> {
  const { data, error } = await supabase.from("project_workspace").insert(row).select(SELECT_WORKSPACE).single()
  if (error) return { row: null, error: mapWorkspaceDbError(error.message, "insert") }
  return { row: (data as unknown as WorkspaceRow) ?? null, error: null }
}

export async function updateWorkspaceDpi(
  supabase: SupabaseClient,
  args: {
    projectId: string
    outputDpi: number
    rasterEffectsPreset: WorkspaceRow["raster_effects_preset"]
  }
): Promise<{ row: WorkspaceRow | null; error: string | null }> {
  const forbidden = findForbiddenKey(args, [
    // canonical geometry
    "widthPxU",
    "heightPxU",
    "width_px_u",
    "height_px_u",
    "widthPx",
    "heightPx",
    "width_px",
    "height_px",
    // display geometry
    "unit",
    "widthValue",
    "heightValue",
    "width_value",
    "height_value",
  ])
  if (forbidden) return { row: null, error: `[update] invalid_payload_for_dpi_update: contains ${forbidden}` }

  const { projectId, outputDpi, rasterEffectsPreset } = args
  const { data, error } = await supabase
    .from("project_workspace")
    .update({
      output_dpi: outputDpi,
      raster_effects_preset: rasterEffectsPreset ?? null,
    })
    .eq("project_id", projectId)
    .select(SELECT_WORKSPACE)
    .single()
  if (error) return { row: null, error: mapWorkspaceDbError(error.message, "update") }
  return { row: (data as unknown as WorkspaceRow) ?? null, error: null }
}

export async function updateWorkspaceGeometry(
  supabase: SupabaseClient,
  args: {
    projectId: string
    unit: WorkspaceRow["unit"]
    widthValue: number
    heightValue: number
    widthPxU: string
    heightPxU: string
    widthPx: number
    heightPx: number
  }
): Promise<{ row: WorkspaceRow | null; error: string | null }> {
  const forbidden = findForbiddenKey(args, [
    // dpi/output-only fields
    "outputDpi",
    "rasterEffectsPreset",
    "output_dpi",
    "raster_effects_preset",
  ])
  if (forbidden) return { row: null, error: `[update] invalid_payload_for_geometry_update: contains ${forbidden}` }

  const { projectId, unit, widthValue, heightValue, widthPxU, heightPxU, widthPx, heightPx } = args
  const { data, error } = await supabase
    .from("project_workspace")
    .update({
      unit,
      width_value: widthValue,
      height_value: heightValue,
      width_px_u: widthPxU,
      height_px_u: heightPxU,
      width_px: widthPx,
      height_px: heightPx,
    })
    .eq("project_id", projectId)
    .select(SELECT_WORKSPACE)
    .single()
  if (error) return { row: null, error: mapWorkspaceDbError(error.message, "update") }
  return { row: (data as unknown as WorkspaceRow) ?? null, error: null }
}

export async function updateWorkspacePageBg(
  supabase: SupabaseClient,
  args: {
    projectId: string
    enabled: boolean
    color: string
    opacity: number
  }
): Promise<{ row: WorkspaceRow | null; error: string | null }> {
  const { projectId, enabled, color, opacity } = args
  const { data, error } = await supabase
    .from("project_workspace")
    .update({
      page_bg_enabled: enabled,
      page_bg_color: color,
      page_bg_opacity: opacity,
    })
    .eq("project_id", projectId)
    .select(SELECT_WORKSPACE)
    .single()
  if (error) return { row: null, error: mapWorkspaceDbError(error.message, "update") }
  return { row: (data as unknown as WorkspaceRow) ?? null, error: null }
}

