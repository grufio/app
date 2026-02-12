/**
 * Editor service: workspace client wrappers.
 *
 * Responsibilities:
 * - Own Supabase browser client creation outside React providers/components.
 * - Delegate all query logic to the existing repo functions (no query changes).
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import type { WorkspaceRow } from "./types"
import { insertWorkspace, selectWorkspace, upsertWorkspace } from "./browser-repo-supabase"

export function selectWorkspaceClient(projectId: string) {
  const supabase = createSupabaseBrowserClient()
  return selectWorkspace(supabase, projectId)
}

export function insertWorkspaceClient(row: WorkspaceRow) {
  const supabase = createSupabaseBrowserClient()
  return insertWorkspace(supabase, row)
}

export function upsertWorkspaceClient(row: WorkspaceRow) {
  const supabase = createSupabaseBrowserClient()
  return upsertWorkspace(supabase, row)
}

