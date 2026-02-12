/**
 * Projects service (client): update project title.
 *
 * Responsibilities:
 * - Update a project's `name` via Supabase from a service function (not from React components).
 * - Keep query shape identical to the previous UI implementation.
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

export async function updateProjectTitleClient(opts: { projectId: string; name: string }): Promise<{ error: string | null }> {
  const supabase = createSupabaseBrowserClient()
  const { error: updateErr } = await supabase.from("projects").update({ name: opts.name }).eq("id", opts.projectId)
  return { error: updateErr ? updateErr.message : null }
}

