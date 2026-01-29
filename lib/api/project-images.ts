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
      signedUrl: string
      width_px: number
      height_px: number
      dpi?: number | null
      name: string
      storage_path?: string
      format?: string
      file_size_bytes?: number
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
