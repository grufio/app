/**
 * Editor service: workspace client wrappers.
 *
 * Responsibilities:
 * - Own Supabase browser client creation outside React providers/components.
 * - Delegate all query logic to the existing repo functions (no query changes).
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import type { WorkspaceRow } from "./types"
import {
  insertWorkspace,
  selectWorkspace,
  updateWorkspaceDpi,
  updateWorkspaceGeometry,
  updateWorkspacePageBg,
} from "./browser-repo-supabase"

export function selectWorkspaceClient(projectId: string) {
  const supabase = createSupabaseBrowserClient()
  return selectWorkspace(supabase, projectId)
}

export function insertWorkspaceClient(row: WorkspaceRow) {
  const supabase = createSupabaseBrowserClient()
  return insertWorkspace(supabase, row)
}

export function updateWorkspaceDpiClient(args: {
  projectId: string
  outputDpi: number
  rasterEffectsPreset: WorkspaceRow["raster_effects_preset"]
}) {
  const supabase = createSupabaseBrowserClient()
  return updateWorkspaceDpi(supabase, args)
}

export function updateWorkspaceGeometryClient(args: {
  projectId: string
  unit: WorkspaceRow["unit"]
  widthValue: number
  heightValue: number
  widthPxU: string
  heightPxU: string
  widthPx: number
  heightPx: number
}) {
  const supabase = createSupabaseBrowserClient()
  return updateWorkspaceGeometry(supabase, args)
}

export function updateWorkspacePageBgClient(args: {
  projectId: string
  enabled: boolean
  color: string
  opacity: number
}) {
  const supabase = createSupabaseBrowserClient()
  return updateWorkspacePageBg(supabase, args)
}

