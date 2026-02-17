/**
 * Projects service (server): create project + initial workspace.
 *
 * Responsibilities:
 * - Create a `projects` row for the user.
 * - Create an initial `project_workspace` row (canonical µpx + cached px).
 *
 * Notes:
 * - This is server-side only (expects an authenticated Supabase server client).
 * - Business rules for workspace sizing are shared with the editor via `lib/editor/units`.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { clampPx, pxUToPxNumber, type Unit, unitToPxU } from "@/lib/editor/units"

type RasterPreset = "high" | "medium" | "low"

function rasterPresetForDpi(dpi: number): RasterPreset {
  if (dpi >= 300) return "high"
  if (dpi >= 150) return "medium"
  return "low"
}

export type CreateProjectInput = {
  ownerId: string
  name: string
  unit: Unit
  width_value: number
  height_value: number
  dpi: number
}

export async function createProjectWithWorkspace(
  supabase: SupabaseClient,
  input: CreateProjectInput
): Promise<{ ok: true; projectId: string } | { ok: false; stage: string; message: string }> {
  const unit = input.unit
  const width_value = Number(input.width_value)
  const height_value = Number(input.height_value)
  const dpi = Number(input.dpi)

  const validUnits: Unit[] = ["mm", "cm", "pt", "px"]
  if (!unit || !validUnits.includes(unit)) return { ok: false, stage: "validation", message: "Invalid unit" }
  if (!Number.isFinite(width_value) || width_value <= 0) return { ok: false, stage: "validation", message: "Invalid width_value" }
  if (!Number.isFinite(height_value) || height_value <= 0) return { ok: false, stage: "validation", message: "Invalid height_value" }
  if (!Number.isFinite(dpi) || dpi <= 0) return { ok: false, stage: "validation", message: "Invalid dpi" }

  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim() : "Untitled"

  const artboard_dpi = dpi
  const widthPxU = unitToPxU(String(width_value), unit, artboard_dpi)
  const heightPxU = unitToPxU(String(height_value), unit, artboard_dpi)
  const width_px_u = widthPxU.toString()
  const height_px_u = heightPxU.toString()
  const width_px = clampPx(pxUToPxNumber(widthPxU))
  const height_px = clampPx(pxUToPxNumber(heightPxU))

  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .insert({ owner_id: input.ownerId, name })
    .select("id")
    .single()

  if (projectErr || !project?.id) {
    return { ok: false, stage: "insert_project", message: "Failed to create project" }
  }

  const { error: wsErr } = await supabase.from("project_workspace").insert({
    project_id: project.id,
    unit,
    width_value,
    height_value,
    artboard_dpi,
    raster_effects_preset: rasterPresetForDpi(dpi),
    width_px_u,
    height_px_u,
    width_px,
    height_px,
  })

  if (wsErr) {
    // Best-effort rollback.
    await supabase.from("projects").delete().eq("id", project.id)
    return { ok: false, stage: "insert_workspace", message: "Failed to create workspace" }
  }

  return { ok: true, projectId: project.id }
}

