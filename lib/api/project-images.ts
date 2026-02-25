/**
 * Client API wrappers for project images.
 *
 * Responsibilities:
 * - Fetch metadata and signed URLs for the master image.
 * - Perform existence checks and deletion via API routes.
 */
import { fetchJson, invalidateFetchJsonGetCache } from "@/lib/api/http"

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
      restore_base?: {
        id: string
        width_px: number
        height_px: number
      } | null
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
  is_locked: boolean
  created_at: string
}

export type SetProjectImageLockedResponse = {
  ok: true
  id: string
  is_locked: boolean
}

export type FilterType = "invert" | "blur" | "brightness"

export type ProjectImageFilterItem = {
  id: string
  input_image_id: string
  output_image_id: string
  filter_type: FilterType
  filter_params: Record<string, unknown>
  stack_order: number
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

export async function setProjectImageLocked(
  projectId: string,
  imageId: string,
  isLocked: boolean
): Promise<SetProjectImageLockedResponse> {
  const res = await fetchJson<SetProjectImageLockedResponse>(`/api/projects/${projectId}/images/master/${imageId}/lock`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_locked: isLocked }),
  })
  if (!res.ok) {
    const msg = `Failed to update image lock (HTTP ${res.status})` + (res.error ? ` ${JSON.stringify(res.error)}` : "")
    throw new Error(msg)
  }
  invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/master/list`)
  invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/master`)
  if (!res.data?.ok || !res.data?.id) {
    throw new Error("Failed to update image lock (invalid response)")
  }
  return {
    ok: true,
    id: String(res.data.id),
    is_locked: Boolean(res.data.is_locked),
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
  invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/master`)
  invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/master/list`)
  return {
    id: String(res.data.id),
    width_px: Number(res.data.width_px ?? 0),
    height_px: Number(res.data.height_px ?? 0),
  }
}

export async function restoreInitialMasterImage(projectId: string): Promise<{ image_id: string }> {
  const res = await fetchJson<{ ok?: boolean; image_id?: string }>(`/api/projects/${projectId}/images/master/restore`, {
    method: "POST",
    credentials: "same-origin",
  })
  if (!res.ok) {
    const msg = `Failed to restore initial image (HTTP ${res.status})` + (res.error ? ` ${JSON.stringify(res.error)}` : "")
    throw new Error(msg)
  }
  if (!res.data?.image_id) {
    throw new Error("Failed to restore initial image (missing image_id)")
  }
  invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/master`)
  invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/master/list`)
  return { image_id: String(res.data.image_id) }
}

export async function listProjectImageFilters(projectId: string): Promise<ProjectImageFilterItem[]> {
  const res = await fetchJson<{ items?: ProjectImageFilterItem[] }>(`/api/projects/${projectId}/images/filters`, {
    method: "GET",
    credentials: "same-origin",
  })
  if (!res.ok) {
    const msg = `Failed to load filters (HTTP ${res.status})` + (res.error ? ` ${JSON.stringify(res.error)}` : "")
    throw new Error(msg)
  }
  return Array.isArray(res.data?.items) ? res.data.items : []
}

export async function applyProjectImageFilter(args: {
  projectId: string
  filterType: FilterType
  filterParams?: Record<string, unknown>
}): Promise<{ item: ProjectImageFilterItem; image_id: string; width_px: number; height_px: number }> {
  const { projectId, filterType, filterParams } = args
  const res = await fetchJson<{
    ok?: boolean
    item?: ProjectImageFilterItem
    image_id?: string
    width_px?: number
    height_px?: number
  }>(`/api/projects/${projectId}/images/filters`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filter_type: filterType,
      filter_params: filterParams ?? {},
    }),
  })
  if (!res.ok) {
    const msg = `Failed to apply filter (HTTP ${res.status})` + (res.error ? ` ${JSON.stringify(res.error)}` : "")
    throw new Error(msg)
  }
  if (!res.data?.item || !res.data.image_id) {
    throw new Error("Failed to apply filter (invalid response)")
  }
  invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/master`)
  invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/master/list`)
  invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/filters`)
  return {
    item: res.data.item,
    image_id: String(res.data.image_id),
    width_px: Number(res.data.width_px ?? 0),
    height_px: Number(res.data.height_px ?? 0),
  }
}

export async function removeProjectImageFilter(args: {
  projectId: string
  filterId: string
}): Promise<{ active_image_id: string }> {
  const { projectId, filterId } = args
  const res = await fetchJson<{ ok?: boolean; active_image_id?: string }>(`/api/projects/${projectId}/images/filters/${filterId}`, {
    method: "DELETE",
    credentials: "same-origin",
  })
  if (!res.ok) {
    const msg = `Failed to remove filter (HTTP ${res.status})` + (res.error ? ` ${JSON.stringify(res.error)}` : "")
    throw new Error(msg)
  }
  if (!res.data?.active_image_id) {
    throw new Error("Failed to remove filter (invalid response)")
  }
  invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/master`)
  invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/master/list`)
  invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/filters`)
  return { active_image_id: String(res.data.active_image_id) }
}

export async function getOrCreateFilterWorkingCopy(projectId: string): Promise<{
  id: string
  signedUrl: string
  width_px: number
  height_px: number
  storage_path: string
  source_image_id: string | null
  name: string
}> {
  const res = await fetchJson<{
    ok?: boolean
    id?: string
    signed_url?: string
    width_px?: number
    height_px?: number
    storage_path?: string
    source_image_id?: string | null
    name?: string
  }>(`/api/projects/${projectId}/images/filter-working-copy`, {
    method: "POST",
    credentials: "same-origin",
  })
  if (!res.ok) {
    const msg =
      `Failed to get filter working copy (HTTP ${res.status})` + (res.error ? ` ${JSON.stringify(res.error)}` : "")
    throw new Error(msg)
  }
  if (!res.data?.id || !res.data.signed_url) {
    throw new Error("Failed to get filter working copy (missing data)")
  }
  return {
    id: String(res.data.id),
    signedUrl: String(res.data.signed_url),
    width_px: Number(res.data.width_px ?? 0),
    height_px: Number(res.data.height_px ?? 0),
    storage_path: String(res.data.storage_path ?? ""),
    source_image_id: res.data.source_image_id ?? null,
    name: String(res.data.name ?? ""),
  }
}

export async function removeActiveFilter(projectId: string): Promise<void> {
  const res = await fetchJson<{ ok?: boolean }>(
    `/api/projects/${projectId}/filters/remove`,
    {
      method: "DELETE",
      credentials: "same-origin",
    }
  )
  if (!res.ok) {
    const msg = `Failed to remove filter (HTTP ${res.status})` + (res.error ? ` ${JSON.stringify(res.error)}` : "")
    throw new Error(msg)
  }
  invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/filter-working-copy`)
}

export async function applyPixelateFilter(args: {
  projectId: string
  sourceImageId: string
  superpixelWidth: number
  superpixelHeight: number
  colorMode: "rgb" | "grayscale"
  numColors: number
}): Promise<{ id: string; width_px: number; height_px: number }> {
  const { projectId, sourceImageId, superpixelWidth, superpixelHeight, colorMode, numColors } = args
  const res = await fetchJson<{ ok?: boolean; id?: string; width_px?: number; height_px?: number }>(
    `/api/projects/${projectId}/filters/pixelate`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json"},
      body: JSON.stringify({
        source_image_id: sourceImageId,
        superpixel_width: superpixelWidth,
        superpixel_height: superpixelHeight,
        color_mode: colorMode,
        num_colors: numColors,
      }),
    }
  )
  if (!res.ok) {
    const msg = `Failed to apply pixelate filter (HTTP ${res.status})` + (res.error ? ` ${JSON.stringify(res.error)}` : "")
    throw new Error(msg)
  }
  if (!res.data?.id) {
    throw new Error("Failed to apply pixelate filter (missing id)")
  }
  invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/master`)
  invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/master/list`)
  return {
    id: String(res.data.id),
    width_px: Number(res.data.width_px ?? 0),
    height_px: Number(res.data.height_px ?? 0),
  }
}

export async function applyLineArtFilter(args: {
  projectId: string
  sourceImageId: string
  threshold1: number
  threshold2: number
  lineThickness: number
  invert: boolean
}): Promise<{ id: string; width_px: number; height_px: number }> {
  const { projectId, sourceImageId, threshold1, threshold2, lineThickness, invert } = args
  const res = await fetchJson<{ ok?: boolean; id?: string; width_px?: number; height_px?: number }>(
    `/api/projects/${projectId}/filters/lineart`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json"},
      body: JSON.stringify({
        source_image_id: sourceImageId,
        threshold1,
        threshold2,
        line_thickness: lineThickness,
        invert,
      }),
    }
  )
  if (!res.ok) {
    const msg = `Failed to apply line art filter (HTTP ${res.status})` + (res.error ? ` ${JSON.stringify(res.error)}` : "")
    throw new Error(msg)
  }
  if (!res.data?.id) {
    throw new Error("Failed to apply line art filter (missing id)")
  }
  invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/filter-working-copy`)
  return {
    id: String(res.data.id),
    width_px: Number(res.data.width_px ?? 0),
    height_px: Number(res.data.height_px ?? 0),
  }
}
