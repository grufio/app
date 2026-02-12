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
import { DEFAULT_PROJECT_CREATE_INPUT } from "@/services/projects/defaults"

export const dynamic = "force-dynamic"

export default async function NewProjectPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const created = await createProjectWithWorkspace(supabase, {
    ownerId: user.id,
    ...DEFAULT_PROJECT_CREATE_INPUT,
  })

  if (!created.ok) {
    redirect("/dashboard")
  }

  redirect(`/projects/${created.projectId}`)
}

