/**
 * New project route (server action).
 *
 * Responsibilities:
 * - Create a project row for the signed-in user.
 * - Best-effort create the default workspace/artboard, then redirect to the editor.
 */
import { redirect } from "next/navigation"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createProjectWithWorkspace } from "@/services/projects"
import type { Unit } from "@/lib/editor/units"

export const dynamic = "force-dynamic"

export default async function NewProjectPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Default Artboard (workspace): 20x30cm @ 300dpi
  const unit: Unit = "cm"
  const width_value = 20
  const height_value = 30
  const dpi = 300

  const created = await createProjectWithWorkspace(supabase, {
    ownerId: user.id,
    name: "Untitled",
    unit,
    width_value,
    height_value,
    dpi,
  })

  if (!created.ok) {
    redirect("/dashboard")
  }

  redirect(`/projects/${created.projectId}`)
}

