/**
 * Filter page (server component shell).
 *
 * Responsibilities:
 * - Validate `projectId` and enforce authentication.
 * - Load initial workspace so filter canvas inherits artboard size/output dpi.
 * - Hydrate filter client layout.
 */
import { notFound, redirect } from "next/navigation"
import { headers } from "next/headers"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { ProjectWorkspaceProvider, type WorkspaceRow } from "@/lib/editor/project-workspace"
import { isUuid } from "@/lib/api/route-guards"
import { isE2ETestRequest } from "@/lib/e2e"
import { isSchemaMismatchMessage, schemaMismatchError, selectWorkspace } from "@/services/editor"

import { ProjectFilterPageClient } from "./page.client"

export const dynamic = "force-dynamic"

async function getInitialWorkspace(projectId: string): Promise<WorkspaceRow | null> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Project must exist and be accessible; otherwise treat as 404.
  const { data: p, error: pErr } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle()
  if (pErr || !p?.id) notFound()

  const { row: ws, error: wsErr } = await selectWorkspace(supabase, projectId)
  if (wsErr) {
    if (isSchemaMismatchMessage(wsErr)) throw schemaMismatchError("project_workspace", wsErr)
    throw new Error(`Failed to load workspace: ${wsErr}`)
  }
  return ws ? (ws as unknown as WorkspaceRow) : null
}

export default async function ProjectFilterPage({ params }: { params: { projectId: string } }) {
  const awaitedParams = (params as unknown) as { projectId?: unknown } | Promise<{ projectId?: unknown }>
  const resolved = awaitedParams instanceof Promise ? await awaitedParams : awaitedParams
  const projectId = String(resolved?.projectId ?? "")
  if (!isUuid(projectId)) notFound()

  const headersList = await headers()
  const isE2E = isE2ETestRequest(headersList)
  const workspace = isE2E ? null : await getInitialWorkspace(projectId)

  return (
    <ProjectWorkspaceProvider projectId={projectId} initialRow={workspace}>
      <ProjectFilterPageClient projectId={projectId} />
    </ProjectWorkspaceProvider>
  )
}

