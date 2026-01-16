import { redirect } from "next/navigation"

import { createSupabaseServerClient } from "@/lib/supabase/server"

function toPx(value: number, unit: "mm" | "cm" | "pt" | "px", dpi: number): number {
  if (unit === "px") return Math.max(1, Math.round(value))
  if (unit === "mm") return Math.max(1, Math.round((value / 25.4) * dpi))
  if (unit === "cm") return Math.max(1, Math.round((value / 2.54) * dpi))
  if (unit === "pt") return Math.max(1, Math.round((value / 72) * dpi))
  return Math.max(1, Math.round(value))
}

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
  const unit = "cm" as const
  const width_value = 20
  const height_value = 30
  const dpi_x = 300
  const dpi_y = 300
  const width_px = toPx(width_value, unit, dpi_x)
  const height_px = toPx(height_value, unit, dpi_y)

  // Best-effort: if this fails, we still redirect; the UI can create defaults later.
  await supabase.from("project_workspace").insert({
    project_id: data.id,
    unit,
    width_value,
    height_value,
    dpi_x,
    dpi_y,
    width_px,
    height_px,
  })

  redirect(`/projects/${data.id}`)
}

