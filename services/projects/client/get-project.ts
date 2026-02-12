/**
 * Projects service (client): read project basics.
 *
 * Responsibilities:
 * - Fetch basic project metadata via Supabase from a service function (not from React hooks/components).
 * - Keep query shape identical to the previous hook implementation.
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

export async function getProjectNameClient(projectId: string): Promise<{ name: string | null; error: string | null }> {
  const supabase = createSupabaseBrowserClient()
  const { data, error } = await supabase.from("projects").select("name").eq("id", projectId).single()
  if (error) return { name: null, error: error.message }
  return { name: (data?.name ?? null) as string | null, error: null }
}

