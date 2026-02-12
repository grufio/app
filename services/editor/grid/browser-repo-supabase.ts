/**
 * Supabase-backed repository for editor grid (browser).
 *
 * Responsibilities:
 * - Read/write `project_grid` in the browser using Supabase PostgREST.
 * - Keep the select list centralized to avoid drift.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import type { ProjectGridRow } from "./types"

const SELECT_GRID = "project_id,color,unit,spacing_value,spacing_x_value,spacing_y_value,line_width_value"

export async function selectGrid(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ row: ProjectGridRow | null; error: string | null }> {
  const { data, error } = await supabase.from("project_grid").select(SELECT_GRID).eq("project_id", projectId).maybeSingle()
  if (error) return { row: null, error: error.message }
  return { row: (data as unknown as ProjectGridRow) ?? null, error: null }
}

export async function insertGrid(
  supabase: SupabaseClient,
  row: ProjectGridRow
): Promise<{ row: ProjectGridRow | null; error: string | null }> {
  const { data, error } = await supabase.from("project_grid").insert(row).select(SELECT_GRID).single()
  if (error) return { row: null, error: error.message }
  return { row: (data as unknown as ProjectGridRow) ?? null, error: null }
}

export async function upsertGrid(
  supabase: SupabaseClient,
  row: ProjectGridRow
): Promise<{ row: ProjectGridRow | null; error: string | null }> {
  const { data, error } = await supabase.from("project_grid").upsert(row, { onConflict: "project_id" }).select(SELECT_GRID).single()
  if (error) return { row: null, error: error.message }
  return { row: (data as unknown as ProjectGridRow) ?? null, error: null }
}

