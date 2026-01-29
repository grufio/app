import { notFound, redirect } from "next/navigation"

import { ProjectWorkspaceProvider, type WorkspaceRow } from "@/lib/editor/project-workspace"
import { ProjectGridProvider, type ProjectGridRow } from "@/lib/editor/project-grid"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { MasterImage } from "@/lib/editor/use-master-image"
import type { Project } from "@/lib/editor/use-project"
import type { ImageState } from "@/lib/editor/use-image-state"
import { isUuid } from "@/lib/api/route-guards"

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

  const [{ data: p }, { data: ws }, { data: grid }, { data: img }, { data: st }] = await Promise.all([
    supabase.from("projects").select("id,name").eq("id", projectId).maybeSingle(),
    supabase
      .from("project_workspace")
      .select(
        "project_id,unit,width_value,height_value,dpi_x,dpi_y,width_px_u,height_px_u,width_px,height_px,raster_effects_preset,page_bg_enabled,page_bg_color,page_bg_opacity"
      )
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase
      .from("project_grid")
      .select("project_id,color,unit,spacing_value,spacing_x_value,spacing_y_value,line_width_value")
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase
      .from("project_images")
      .select("storage_path,name,width_px,height_px,dpi_x,role")
      .eq("project_id", projectId)
      .eq("role", "master")
      .maybeSingle(),
    supabase
      .from("project_image_state")
      .select("x_px_u,y_px_u,width_px_u,height_px_u,rotation_deg,role")
      .eq("project_id", projectId)
      .eq("role", "master")
      .maybeSingle(),
  ])

  const project: Project | null = p?.id ? { id: projectId, name: String((p as { name?: unknown })?.name ?? "") } : null
  const workspaceRow = ws ? (ws as unknown as WorkspaceRow) : null
  const gridRow = grid ? (grid as unknown as ProjectGridRow) : null

  let masterImage: MasterImage | null = null
  if (img && (img as { storage_path?: unknown })?.storage_path) {
    const storagePath = String((img as { storage_path: unknown }).storage_path)
    const { data: signed } = await supabase.storage.from("project_images").createSignedUrl(storagePath, 60 * 10)
    if (signed?.signedUrl) {
      masterImage = {
        signedUrl: signed.signedUrl,
        width_px: Number((img as { width_px?: unknown })?.width_px ?? 0),
        height_px: Number((img as { height_px?: unknown })?.height_px ?? 0),
        dpi: (img as { dpi_x?: unknown })?.dpi_x == null ? null : Number((img as { dpi_x: unknown }).dpi_x),
        name: String((img as { name?: unknown })?.name ?? "master image"),
      }
    }
  }

  const imageState: ImageState | null =
    st && (st as { width_px_u?: unknown; height_px_u?: unknown })?.width_px_u && (st as { height_px_u?: unknown })?.height_px_u
      ? {
          xPxU: typeof (st as { x_px_u?: unknown })?.x_px_u === "string" ? BigInt((st as { x_px_u: string }).x_px_u) : undefined,
          yPxU: typeof (st as { y_px_u?: unknown })?.y_px_u === "string" ? BigInt((st as { y_px_u: string }).y_px_u) : undefined,
          widthPxU: BigInt((st as { width_px_u: string }).width_px_u),
          heightPxU: BigInt((st as { height_px_u: string }).height_px_u),
          rotationDeg: Number((st as { rotation_deg?: unknown })?.rotation_deg ?? 0),
        }
      : null

  return { project, workspace: workspaceRow, grid: gridRow, masterImage, imageState }
}

export default async function ProjectDetailPage({ params }: { params: { projectId: string } }) {
  // Next.js may pass params as a Promise in newer versions (similar to Route Handlers).
  // Accept both shapes to avoid accidentally treating projectId as undefined.
  const awaitedParams = (params as unknown) as { projectId?: unknown } | Promise<{ projectId?: unknown }>
  const resolved = awaitedParams instanceof Promise ? await awaitedParams : awaitedParams
  const projectId = String(resolved?.projectId ?? "")
  if (!isUuid(String(projectId))) notFound()
  const isE2E = process.env.NEXT_PUBLIC_E2E_TEST === "1" || process.env.E2E_TEST === "1"
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

