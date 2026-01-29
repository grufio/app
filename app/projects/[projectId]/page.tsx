/**
 * Project editor page (server component shell).
 *
 * Responsibilities:
 * - Validate `projectId` and enforce authentication.
 * - Fetch initial workspace/grid/image/image-state data server-side and hydrate client editor.
 */
import { notFound, redirect } from "next/navigation"

import { ProjectWorkspaceProvider, type WorkspaceRow } from "@/lib/editor/project-workspace"
import { ProjectGridProvider, type ProjectGridRow } from "@/lib/editor/project-grid"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { MasterImage } from "@/lib/editor/use-master-image"
import type { Project } from "@/lib/editor/use-project"
import type { ImageState } from "@/lib/editor/use-image-state"
import { isUuid } from "@/lib/api/route-guards"
import { parseBigIntString } from "@/lib/editor/imageState"

import { ProjectDetailPageClient } from "./page.client"

export const dynamic = "force-dynamic"

function isSchemaMismatchMessage(message: string): boolean {
  // PostgREST schema cache / missing DDL commonly presents as "column ... does not exist" or similar.
  return /does not exist|schema cache|PGRST/i.test(message) && /column|relation|schema/i.test(message)
}

function schemaMismatchError(stage: string, message: string): Error {
  return new Error(
    [
      `Schema mismatch (${stage}).`,
      message,
      "Fix: apply migrations (preferred: `supabase db push --linked`), then regenerate types (`npm run types:gen`).",
    ].join(" ")
  )
}

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
  const [{ data: ws, error: wsErr }, { data: grid, error: gridErr }, { data: img, error: imgErr }, { data: st, error: stErr }] =
    await Promise.all([
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
        // Some deployments do not have `project_images.dpi_x` yet; DPI is metadata-only.
        .select("storage_path,name,width_px,height_px,role")
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

  // Workspace is effectively required; surface schema mismatch explicitly.
  if (wsErr) {
    if (isSchemaMismatchMessage(wsErr.message)) throw schemaMismatchError("project_workspace", wsErr.message)
    throw new Error(`Failed to load workspace: ${wsErr.message}`)
  }

  // Grid and image state can be missing; prefer partial boot.
  if (gridErr) {
    if (isSchemaMismatchMessage(gridErr.message)) {
      console.warn("project_grid schema mismatch:", gridErr.message)
    } else {
      throw new Error(`Failed to load grid: ${gridErr.message}`)
    }
  }
  if (stErr) {
    if (isSchemaMismatchMessage(stErr.message)) {
      console.warn("project_image_state schema mismatch:", stErr.message)
    } else {
      throw new Error(`Failed to load image state: ${stErr.message}`)
    }
  }
  if (imgErr) {
    if (isSchemaMismatchMessage(imgErr.message)) {
      console.warn("project_images schema mismatch:", imgErr.message)
    } else {
      throw new Error(`Failed to load master image metadata: ${imgErr.message}`)
    }
  }

  const project: Project = { id: projectId, name: p.name ?? "" }
  const workspaceRow: WorkspaceRow | null = ws
    ? {
        project_id: ws.project_id,
        unit: ws.unit,
        width_value: ws.width_value,
        height_value: ws.height_value,
        dpi_x: ws.dpi_x,
        dpi_y: ws.dpi_y,
        width_px_u: ws.width_px_u,
        height_px_u: ws.height_px_u,
        width_px: ws.width_px,
        height_px: ws.height_px,
        raster_effects_preset: (ws.raster_effects_preset as WorkspaceRow["raster_effects_preset"]) ?? null,
        page_bg_enabled: ws.page_bg_enabled,
        page_bg_color: ws.page_bg_color,
        page_bg_opacity: ws.page_bg_opacity,
      }
    : null
  const gridRow: ProjectGridRow | null = grid && !gridErr
    ? {
        project_id: grid.project_id,
        color: grid.color,
        unit: grid.unit,
        spacing_value: grid.spacing_value,
        spacing_x_value: grid.spacing_x_value ?? grid.spacing_value,
        spacing_y_value: grid.spacing_y_value ?? grid.spacing_value,
        line_width_value: grid.line_width_value,
      }
    : null

  let masterImage: MasterImage | null = null
  if (img?.storage_path && !imgErr) {
    const storagePath = img.storage_path
    const { data: signed, error: signedErr } = await supabase.storage.from("project_images").createSignedUrl(storagePath, 60 * 10)
    if (signedErr) {
      // Prefer partial boot: editor can still open and the user can re-upload.
      console.warn("Failed to create signed URL:", signedErr.message)
    }
    if (signed?.signedUrl) {
      masterImage = {
        signedUrl: signed.signedUrl,
        width_px: Number(img.width_px ?? 0),
        height_px: Number(img.height_px ?? 0),
        dpi: null,
        name: img.name ?? "master image",
      }
    }
  }

  const widthPxU = st ? parseBigIntString(st.width_px_u) : null
  const heightPxU = st ? parseBigIntString(st.height_px_u) : null
  const xPxU = st ? parseBigIntString(st.x_px_u) : null
  const yPxU = st ? parseBigIntString(st.y_px_u) : null
  const rotationDeg = st?.rotation_deg ?? 0
  const imageState: ImageState | null =
    widthPxU && heightPxU
      ? {
          xPxU: xPxU ?? undefined,
          yPxU: yPxU ?? undefined,
          widthPxU,
          heightPxU,
          rotationDeg: Number(rotationDeg),
        }
      : st && !stErr
        ? (() => {
            // Unsupported persisted state: present row but missing canonical µpx size.
            throw new Error("Unsupported image state: missing width_px_u/height_px_u")
          })()
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

