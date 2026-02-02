/**
 * Project editor page (server component shell).
 *
 * Responsibilities:
 * - Validate `projectId` and enforce authentication.
 * - Fetch initial workspace/grid/image/image-state data server-side and hydrate client editor.
 */
import { notFound, redirect } from "next/navigation"
import { headers } from "next/headers"

import { ProjectWorkspaceProvider, type WorkspaceRow } from "@/lib/editor/project-workspace"
import { ProjectGridProvider, type ProjectGridRow } from "@/lib/editor/project-grid"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { MasterImage } from "@/lib/editor/use-master-image"
import type { Project } from "@/lib/editor/use-project"
import type { ImageState } from "@/lib/editor/use-image-state"
import { isUuid } from "@/lib/api/route-guards"
import { isE2ETestRequest } from "@/lib/e2e"
import { getImageStateForEditor, getMasterImageForEditor, isSchemaMismatchMessage, normalizeProjectGridRow, schemaMismatchError, selectGrid, selectWorkspace } from "@/services/editor"

import { ProjectDetailPageClient } from "./page.client"

export const dynamic = "force-dynamic"

async function getInitialProjectData(projectId: string): Promise<{
  project: Project | null
  workspace: WorkspaceRow | null
  grid: ProjectGridRow | null
  masterImage: MasterImage | null
  imageState: ImageState | null
}> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Project must exist and be accessible; otherwise treat as 404.
  const { data: p, error: pErr } = await supabase.from("projects").select("id,name").eq("id", projectId).maybeSingle()
  if (pErr || !p?.id) notFound()

  // Fetch non-critical editor data in parallel.
  const [{ row: ws, error: wsErr }, { row: grid, error: gridErr }, { masterImage, error: imgErr }, stRes] =
    await Promise.all([
      selectWorkspace(supabase, projectId),
      selectGrid(supabase, projectId),
      getMasterImageForEditor(supabase, projectId),
      getImageStateForEditor(supabase, projectId),
    ])

  // Workspace is effectively required; surface schema mismatch explicitly.
  if (wsErr) {
    if (isSchemaMismatchMessage(wsErr)) throw schemaMismatchError("project_workspace", wsErr)
    throw new Error(`Failed to load workspace: ${wsErr}`)
  }

  // Grid and image state can be missing; prefer partial boot.
  if (gridErr) {
    if (isSchemaMismatchMessage(gridErr)) {
      console.warn("project_grid schema mismatch:", gridErr)
    } else {
      throw new Error(`Failed to load grid: ${gridErr}`)
    }
  }
  if (stRes.error) {
    if (isSchemaMismatchMessage(stRes.error)) {
      console.warn("project_image_state schema mismatch:", stRes.error)
    } else {
      throw new Error(`Failed to load image state: ${stRes.error}`)
    }
  }
  if (imgErr) {
    if (isSchemaMismatchMessage(imgErr)) {
      console.warn("project_images schema mismatch:", imgErr)
    } else {
      throw new Error(`Failed to load master image metadata: ${imgErr}`)
    }
  }
  if (stRes.unsupported) {
    throw new Error("Unsupported image state: missing width_px_u/height_px_u")
  }

  const project: Project = { id: projectId, name: p.name ?? "" }
  const workspaceRow: WorkspaceRow | null = ws ? (ws as unknown as WorkspaceRow) : null
  const gridRow: ProjectGridRow | null = grid && !gridErr ? (normalizeProjectGridRow(grid) as unknown as ProjectGridRow) : null

  return { project, workspace: workspaceRow, grid: gridRow, masterImage, imageState: stRes.imageState }
}

export default async function ProjectDetailPage({ params }: { params: { projectId: string } }) {
  // Next.js may pass params as a Promise in newer versions (similar to Route Handlers).
  // Accept both shapes to avoid accidentally treating projectId as undefined.
  const awaitedParams = (params as unknown) as { projectId?: unknown } | Promise<{ projectId?: unknown }>
  const resolved = awaitedParams instanceof Promise ? await awaitedParams : awaitedParams
  const projectId = String(resolved?.projectId ?? "")
  if (!isUuid(String(projectId))) notFound()
  const headersList = await headers()
  const isE2E = isE2ETestRequest(headersList)
  // E2E runs with mocked browser network and no real Supabase; skip server fetch in that mode.
  const { project, workspace, grid, masterImage, imageState } = isE2E
    ? { project: null, workspace: null, grid: null, masterImage: null, imageState: null }
    : await getInitialProjectData(projectId)

  return (
    <ProjectWorkspaceProvider projectId={projectId} initialRow={workspace}>
      <ProjectGridProvider projectId={projectId} initialRow={grid}>
        <ProjectDetailPageClient
          projectId={projectId}
          initialProject={project}
          initialMasterImage={masterImage}
          initialImageState={imageState}
        />
      </ProjectGridProvider>
    </ProjectWorkspaceProvider>
  )
}

