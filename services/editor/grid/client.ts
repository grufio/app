/**
 * Editor service: grid client wrappers.
 *
 * Responsibilities:
 * - Own Supabase browser client creation outside React providers/components.
 * - Delegate all query logic to the existing repo functions (no query changes).
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import type { ProjectGridRow } from "./types"
import { insertGrid, selectGrid, upsertGrid } from "./browser-repo-supabase"

export function selectGridClient(projectId: string) {
  const supabase = createSupabaseBrowserClient()
  return selectGrid(supabase, projectId)
}

export function insertGridClient(row: ProjectGridRow) {
  const supabase = createSupabaseBrowserClient()
  return insertGrid(supabase, row)
}

export function upsertGridClient(row: ProjectGridRow) {
  const supabase = createSupabaseBrowserClient()
  return upsertGrid(supabase, row)
}

