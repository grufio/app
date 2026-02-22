/**
 * Client API wrappers for project images.
 *
 * Responsibilities:
 * - Fetch metadata and signed URLs for the master image.
 * - Perform existence checks and deletion via API routes.
 */
import { fetchJson } from "@/lib/api/http"

export type MasterImageResponse =
  | { exists: false }
  | {
      exists: true
      id: string
      signedUrl: string
      width_px: number
      height_px: number
      dpi?: number | null
      name: string
      storage_path?: string
      format?: string
      file_size_bytes?: number
    }

export type ProjectImageItem = {
  id: string
  name: string
  format: string | null
  width_px: number
  height_px: number
  dpi: number | null
  storage_path: string | null
  storage_bucket: string | null
  file_size_bytes: number | null
  is_active: boolean
  created_at: string
}

export async function getMasterImage(projectId: string): Promise<MasterImageResponse> {
  const res = await fetchJson<MasterImageResponse>(`/api/projects/${projectId}/images/master`, {
    method: "GET",
    credentials: "same-origin",
  })
  if (!res.ok) {
    const msg = `Failed to load image (HTTP ${res.status})` + (res.error ? ` ${JSON.stringify(res.error)}` : "")
    throw new Error(msg)
  }
  return res.data
}

export async function hasMasterImage(projectId: string): Promise<boolean> {
  const res = await fetchJson<{ exists?: boolean }>(`/api/projects/${projectId}/images/master/exists`, {
    method: "GET",
    credentials: "same-origin",
  })
  if (!res.ok) return false
  return Boolean(res.data?.exists)
}

export async function deleteMasterImage(projectId: string): Promise<void> {
  const res = await fetchJson<unknown>(`/api/projects/${projectId}/images/master`, {
    method: "DELETE",
    credentials: "same-origin",
  })
  if (!res.ok) {
    const msg = `Failed to delete image (HTTP ${res.status})` + (res.error ? ` ${JSON.stringify(res.error)}` : "")
    throw new Error(msg)
  }
}

export async function listMasterImages(projectId: string): Promise<ProjectImageItem[]> {
  const res = await fetchJson<{ items?: ProjectImageItem[] }>(`/api/projects/${projectId}/images/master/list`, {
    method: "GET",
    credentials: "same-origin",
  })
  if (!res.ok) {
    const msg = `Failed to load images (HTTP ${res.status})` + (res.error ? ` ${JSON.stringify(res.error)}` : "")
    throw new Error(msg)
  }
  return Array.isArray(res.data?.items) ? res.data.items : []
}

export async function deleteMasterImageById(projectId: string, imageId: string): Promise<void> {
  const res = await fetchJson<unknown>(`/api/projects/${projectId}/images/master/${imageId}`, {
    method: "DELETE",
    credentials: "same-origin",
  })
  if (!res.ok) {
    const msg = `Failed to delete image (HTTP ${res.status})` + (res.error ? ` ${JSON.stringify(res.error)}` : "")
    throw new Error(msg)
  }
}

export async function cropImageVariant(args: {
  projectId: string
  sourceImageId: string
  x: number
  y: number
  w: number
  h: number
}): Promise<{ id: string; width_px: number; height_px: number }> {
  const { projectId, sourceImageId, x, y, w, h } = args
  const res = await fetchJson<{ ok?: boolean; id?: string; width_px?: number; height_px?: number }>(
    `/api/projects/${projectId}/images/crop`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_image_id: sourceImageId,
        x,
        y,
        w,
        h,
      }),
    }
  )
  if (!res.ok) {
    const msg = `Failed to crop image (HTTP ${res.status})` + (res.error ? ` ${JSON.stringify(res.error)}` : "")
    throw new Error(msg)
  }
  if (!res.data?.id) {
    throw new Error("Failed to crop image (missing id)")
  }
  return {
    id: String(res.data.id),
    width_px: Number(res.data.width_px ?? 0),
    height_px: Number(res.data.height_px ?? 0),
  }
}
