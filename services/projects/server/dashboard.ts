/**
 * Projects service (server): dashboard listing.
 *
 * Responsibilities:
 * - Fetch projects for the signed-in user (RLS enforced).
 * - Batch-sign master image thumbnails.
 * - Map DB rows into a dashboard-ready view model (no UI rendering).
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { parseBigIntString } from "@/lib/editor/imageState"
import type { Database } from "@/lib/supabase/database.types"

export type DashboardProjectRow = Pick<
  Database["public"]["Tables"]["projects"]["Row"],
  "id" | "name" | "updated_at" | "status"
> & {
  project_images: Array<
    Pick<
      Database["public"]["Tables"]["project_images"]["Row"],
      "role" | "file_size_bytes" | "storage_path" | "name" | "format" | "width_px" | "height_px"
    >
  >
  project_workspace: Pick<Database["public"]["Tables"]["project_workspace"]["Row"], "width_px" | "height_px"> | null
  project_image_state: Array<
    Pick<
      Database["public"]["Tables"]["project_image_state"]["Row"],
      "role" | "x_px_u" | "y_px_u" | "width_px_u" | "height_px_u" | "rotation_deg"
    >
  >
}

export type DashboardProjectVM = {
  id: string
  title: string
  href: string
  dateLabel?: string
  statusLabel?: string
  fileSizeLabel?: string
  hasThumbnail: boolean
  thumbUrl?: string | null
  artboardWidthPx?: number
  artboardHeightPx?: number
  initialImageTransform:
    | {
        rotationDeg: number
        xPxU?: bigint
        yPxU?: bigint
        widthPxU?: bigint
        heightPxU?: bigint
      }
    | null
}

export function mapDashboardRow(row: DashboardProjectRow, signedUrlByPath: Map<string, string>): DashboardProjectVM {
  const master = row.project_images?.find((img) => img.role === "master") ?? null
  const bytes = master?.file_size_bytes ?? 0
  const fileSizeLabel = master ? `${Math.round(bytes / 1024)} kb` : undefined
  const hasThumbnail = Boolean(master)
  const thumbUrl = master?.storage_path ? signedUrlByPath.get(master.storage_path) ?? null : null

  const artboardWidthPx = row.project_workspace?.width_px ?? undefined
  const artboardHeightPx = row.project_workspace?.height_px ?? undefined

  const st = row.project_image_state?.find((s) => s.role === "master") ?? null
  const initialImageTransform = st
    ? {
        rotationDeg: Number(st.rotation_deg ?? 0),
        xPxU: parseBigIntString(st.x_px_u) ?? undefined,
        yPxU: parseBigIntString(st.y_px_u) ?? undefined,
        widthPxU: parseBigIntString(st.width_px_u) ?? undefined,
        heightPxU: parseBigIntString(st.height_px_u) ?? undefined,
      }
    : null

  return {
    id: row.id,
    title: row.name,
    href: `/projects/${row.id}`,
    dateLabel: row.updated_at ? new Date(row.updated_at).toLocaleString() : undefined,
    statusLabel: row.status === "completed" ? "Completed" : undefined,
    fileSizeLabel,
    hasThumbnail,
    thumbUrl,
    artboardWidthPx,
    artboardHeightPx,
    initialImageTransform,
  }
}

export async function listDashboardProjects(
  supabase: SupabaseClient<Database>
): Promise<{ projects: DashboardProjectVM[]; error: string | null }> {
  const { data: rows, error } = await supabase
    .from("projects")
    .select(
      "id,name,updated_at,status,project_images(role,file_size_bytes,storage_path,name,format,width_px,height_px),project_workspace(width_px,height_px),project_image_state(role,x_px_u,y_px_u,width_px_u,height_px_u,rotation_deg)"
    )
    .order("updated_at", { ascending: false })
    .limit(100)
    .returns<DashboardProjectRow[]>()

  if (error) return { projects: [], error: error.message }

  const masterPaths = Array.from(
    new Set(
      (rows ?? [])
        .map((r) => r.project_images?.find((img) => img.role === "master")?.storage_path ?? null)
        .filter((p): p is string => typeof p === "string" && p.length > 0)
    )
  )

  const signedUrlByPath = new Map<string, string>()
  if (masterPaths.length) {
    const { data: signed, error: signedErr } = await supabase.storage.from("project_images").createSignedUrls(masterPaths, 60 * 10)
    if (signedErr) {
      return { projects: [], error: signedErr.message }
    }
    for (const item of signed ?? []) {
      if (item?.path && item?.signedUrl) signedUrlByPath.set(item.path, item.signedUrl)
    }
  }

  return { projects: (rows ?? []).map((r) => mapDashboardRow(r, signedUrlByPath)), error: null }
}

