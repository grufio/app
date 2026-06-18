/**
 * Project editor page (server component shell).
 *
 * Responsibilities:
 * - Validate `projectId` and enforce authentication.
 * - Fetch initial workspace/grid/image/image-state data server-side and hydrate client editor.
 */
import type { Viewport } from "next"
import { notFound, redirect } from "next/navigation"
import { headers } from "next/headers"

import { ProjectWorkspaceProvider, type WorkspaceRow } from "@/lib/editor/project-workspace"
import { ProjectGridProvider, type ProjectGridRow } from "@/lib/editor/project-grid"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { MasterImage } from "@/lib/editor/hooks/use-master-image"
import type { Project } from "@/lib/editor/hooks/use-project"
import type { ImageState } from "@/lib/editor/imageState"
import { isUuid } from "@/lib/api/route-guards"
import { isE2ETestRequest } from "@/lib/e2e"
import { getImageStateForEditor, getMasterImageForEditor, isSchemaMismatchMessage, normalizeProjectGridRow, schemaMismatchError, selectGrid, selectWorkspace } from "@/services/editor"

import { AppSidebarMain } from "@/components/navigation/AppSidebarMain"
import { SidebarFrame } from "@/components/navigation/SidebarFrame"
import { SidebarInset } from "@/components/ui/sidebar"

import { ProjectDetailPageClient } from "./page.client"

type SidebarUser = { name: string; email: string; avatar: string }
const E2E_FAKE_SIDEBAR_USER: SidebarUser = { name: "E2E", email: "e2e@example.com", avatar: "" }

export const dynamic = "force-dynamic"

// Temporary: lock zoom on the editor route so iOS doesn't auto-zoom when a
// 12px panel input gets focus (iOS zooms any field with font-size < 16px).
// Keeps `viewport-fit=cover` for the fullscreen dialogs' safe-area. Scoped to
// this route, so the rest of the app keeps pinch-zoom.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
}

async function getInitialProjectData(projectId: string): Promise<{
  project: Project | null
  workspace: WorkspaceRow | null
  grid: ProjectGridRow | null
  masterImage: MasterImage | null
  imageState: ImageState | null
  sidebarUser: SidebarUser
}> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Same shape the dashboard sidebar uses (NavUser footer).
  const sidebarUser: SidebarUser = {
    name:
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      user.email?.split("@")[0] ??
      "User",
    email: user.email ?? "",
    avatar: (user.user_metadata?.avatar_url as string | undefined) ?? "",
  }

  // Project must exist and be accessible; otherwise treat as 404.
  const { data: p, error: pErr } = await supabase.from("projects").select("id,name").eq("id", projectId).maybeSingle()
  if (pErr || !p?.id) notFound()

  // Fetch non-critical editor data in parallel where possible.
  const [{ row: ws, error: wsErr }, { row: grid, error: gridErr }, { masterImage, error: imgErr }] = await Promise.all([
    selectWorkspace(supabase, projectId),
    selectGrid(supabase, projectId),
    getMasterImageForEditor(supabase, projectId),
  ])
  const stRes = await getImageStateForEditor(supabase, projectId)

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

  return { project, workspace: workspaceRow, grid: gridRow, masterImage, imageState: stRes.imageState, sidebarUser }
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
  const { project, workspace, grid, masterImage, imageState, sidebarUser } = isE2E
    ? { project: null, workspace: null, grid: null, masterImage: null, imageState: null, sidebarUser: E2E_FAKE_SIDEBAR_USER }
    : await getInitialProjectData(projectId)

  return (
    <SidebarFrame defaultOpen={false}>
      {/* The existing app sidebar (same as the dashboard). Its SidebarRail is
          the collapse/expand "Lasche". Desktop-only mount (mobile uses the
          provider's sheet). */}
      <div className="hidden md:contents">
        <AppSidebarMain user={sidebarUser} />
      </div>
      <SidebarInset>
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
      </SidebarInset>
    </SidebarFrame>
  )
}

