import { NextResponse } from "next/server"

import { clampPx, pxUToPxNumber, type Unit, unitToPxU } from "@/lib/editor/units"
import { createSupabaseServerClient } from "@/lib/supabase/server"

function rasterPresetForDpi(dpi: number): "high" | "medium" | "low" {
  if (dpi >= 300) return "high"
  if (dpi >= 150) return "medium"
  return "low"
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const b = body as Partial<{
    name: string
    unit: Unit
    width_value: number
    height_value: number
    dpi: number
  }>

  const name = typeof b.name === "string" && b.name.trim() ? b.name.trim() : "Untitled"
  const unit = b.unit
  const width_value = Number(b.width_value)
  const height_value = Number(b.height_value)
  const dpi = Number(b.dpi)

  const validUnits: Unit[] = ["mm", "cm", "pt", "px"]
  if (!unit || !validUnits.includes(unit)) return NextResponse.json({ error: "Invalid unit" }, { status: 400 })
  if (!Number.isFinite(width_value) || width_value <= 0) {
    return NextResponse.json({ error: "Invalid width_value" }, { status: 400 })
  }
  if (!Number.isFinite(height_value) || height_value <= 0) {
    return NextResponse.json({ error: "Invalid height_value" }, { status: 400 })
  }
  if (!Number.isFinite(dpi) || dpi <= 0) return NextResponse.json({ error: "Invalid dpi" }, { status: 400 })

  const dpi_x = dpi
  const dpi_y = dpi
  const widthPxU = unitToPxU(String(width_value), unit, dpi_x)
  const heightPxU = unitToPxU(String(height_value), unit, dpi_y)
  const width_px_u = widthPxU.toString()
  const height_px_u = heightPxU.toString()
  const width_px = clampPx(pxUToPxNumber(widthPxU))
  const height_px = clampPx(pxUToPxNumber(heightPxU))

  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .insert({ owner_id: user.id, name })
    .select("id")
    .single()

  if (projectErr || !project?.id) {
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 })
  }

  const { error: wsErr } = await supabase.from("project_workspace").insert({
    project_id: project.id,
    unit,
    width_value,
    height_value,
    dpi_x,
    dpi_y,
    raster_effects_preset: rasterPresetForDpi(dpi),
    width_px_u,
    height_px_u,
    width_px,
    height_px,
  })

  if (wsErr) {
    // Best-effort rollback
    await supabase.from("projects").delete().eq("id", project.id)
    return NextResponse.json({ error: "Failed to create workspace" }, { status: 500 })
  }

  return NextResponse.json({ id: project.id })
}

