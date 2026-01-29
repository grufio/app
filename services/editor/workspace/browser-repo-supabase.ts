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
  "project_id,unit,width_value,height_value,dpi_x,dpi_y,width_px_u,height_px_u,width_px,height_px,raster_effects_preset,page_bg_enabled,page_bg_color,page_bg_opacity"

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

export async function upsertWorkspace(
  supabase: SupabaseClient,
  row: WorkspaceRow
): Promise<{ row: WorkspaceRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("project_workspace")
    .upsert(row, { onConflict: "project_id" })
    .select(SELECT_WORKSPACE)
    .single()
  if (error) return { row: null, error: error.message }
  return { row: (data as unknown as WorkspaceRow) ?? null, error: null }
}

