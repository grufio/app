/**
 * New project route (server action).
 *
 * Responsibilities:
 * - Create a project row for the signed-in user.
 * - Best-effort create the default workspace/artboard, then redirect to the editor.
 */
import { redirect } from "next/navigation"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { clampPx, pxUToPxNumber, type Unit, unitToPxU } from "@/lib/editor/units"

export const dynamic = "force-dynamic"

export default async function NewProjectPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      name: "Untitled",
    })
    .select("id")
    .single()

  if (error || !data?.id) {
    redirect("/dashboard")
  }

  // Create default Artboard (workspace): 20x30cm @ 300dpi
  const unit: Unit = "cm"
  const width_value = 20
  const height_value = 30
  const dpi_x = 300
  const dpi_y = 300
  const widthPxU = unitToPxU(String(width_value), unit, dpi_x)
  const heightPxU = unitToPxU(String(height_value), unit, dpi_y)
  const width_px_u = widthPxU.toString()
  const height_px_u = heightPxU.toString()
  const width_px = clampPx(pxUToPxNumber(widthPxU))
  const height_px = clampPx(pxUToPxNumber(heightPxU))

  // Best-effort: if this fails, we still redirect; the UI can create defaults later.
  await supabase.from("project_workspace").insert({
    project_id: data.id,
    unit,
    width_value,
    height_value,
    dpi_x,
    dpi_y,
    raster_effects_preset: "high",
    width_px_u,
    height_px_u,
    width_px,
    height_px,
  })

  redirect(`/projects/${data.id}`)
}

