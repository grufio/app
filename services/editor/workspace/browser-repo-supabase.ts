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

export async function selectWorkspace(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ row: WorkspaceRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("project_workspace")
    .select(SELECT_WORKSPACE)
    .eq("project_id", projectId)
    .maybeSingle()
  if (error) return { row: null, error: error.message }
  return { row: (data as unknown as WorkspaceRow) ?? null, error: null }
}

export async function insertWorkspace(
  supabase: SupabaseClient,
  row: WorkspaceRow
): Promise<{ row: WorkspaceRow | null; error: string | null }> {
  const { data, error } = await supabase.from("project_workspace").insert(row).select(SELECT_WORKSPACE).single()
  if (error) return { row: null, error: error.message }
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
  if (error) return { row: null, error: error.message }
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
  if (error) return { row: null, error: error.message }
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
  if (error) return { row: null, error: error.message }
  return { row: (data as unknown as WorkspaceRow) ?? null, error: null }
}

