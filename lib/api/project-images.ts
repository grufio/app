/**
 * Client API wrappers for project images.
 *
 * Responsibilities:
 * - Fetch metadata and signed URLs for the master image.
 * - Perform existence checks and deletion via API routes.
 */
import { fetchJson, invalidateFetchJsonGetCache } from "@/lib/api/http"

type ApiErrorPayload = Record<string, unknown> | null

function formatApiError(prefix: string, status: number, payload: ApiErrorPayload): string {
  const stage = typeof payload?.stage === "string" && payload.stage.trim() ? payload.stage : `http_${status}`
  const error =
    typeof payload?.error === "string" && payload.error.trim()
      ? payload.error
      : payload
        ? JSON.stringify(payload)
        : "No JSON error body returned"
  const code = typeof payload?.code === "string" && payload.code.trim() ? ` code=${payload.code}` : ""
  return `${prefix} (HTTP ${status}, stage=${stage}${code}): ${error}`
}

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

export type ImageDeleteReason = "no_active_image" | "master_immutable" | null
export type ImageKind = "master" | "working_copy" | "filter_working_copy" | null

export type ProjectImageDisplayTarget = {
  active_image_id: string | null
  kind: ImageKind
  deletable: boolean
  reason: ImageDeleteReason
}

export type ProjectImageFallbackTarget = {
  image_id?: string
  kind: "working_copy"
} | null

export type SetProjectImageLockedResponse = {
  ok: true
  id: string
  is_locked: boolean
}

export type FilterType = "pixelate" | "lineart" | "numerate"

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
    throw new Error(formatApiError("Failed to load image", res.status, res.error))
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
    throw new Error(formatApiError("Failed to delete image", res.status, res.error))
  }
}

export async function listMasterImages(projectId: string): Promise<{ items: ProjectImageItem[]; displayTarget: ProjectImageDisplayTarget; fallbackTarget: ProjectImageFallbackTarget }> {
  const res = await fetchJson<{ items?: ProjectImageItem[]; display_target?: Partial<ProjectImageDisplayTarget>; fallback_target?: ProjectImageFallbackTarget }>(`/api/projects/${projectId}/images/master/list`, {
    method: "GET",
    credentials: "same-origin",
  })
  if (!res.ok) {
    throw new Error(formatApiError("Failed to load images", res.status, res.error))
  }
  return {
    items: Array.isArray(res.data?.items) ? res.data.items : [],
    displayTarget: {
      active_image_id: typeof res.data?.display_target?.active_image_id === "string" ? res.data.display_target.active_image_id : null,
      kind:
        res.data?.display_target?.kind === "master" ||
        res.data?.display_target?.kind === "working_copy" ||
        res.data?.display_target?.kind === "filter_working_copy"
          ? res.data.display_target.kind
          : null,
      deletable: Boolean(res.data?.display_target?.deletable),
      reason:
        res.data?.display_target?.reason === "no_active_image" ||
        res.data?.display_target?.reason === "master_immutable"
          ? res.data.display_target.reason
          : null,
    },
    fallbackTarget:
      res.data?.fallback_target?.kind === "working_copy"
        ? {
            image_id: typeof res.data?.fallback_target?.image_id === "string" ? res.data.fallback_target.image_id : undefined,
            kind: "working_copy",
          }
        : null,
  }
}

export async function deleteMasterImageById(projectId: string, imageId: string): Promise<void> {
  const masterListPath = `/api/projects/${projectId}/images/master/list`
  const masterPath = `/api/projects/${projectId}/images/master`
  invalidateFetchJsonGetCache(masterListPath)
  invalidateFetchJsonGetCache(masterPath)

  const res = await fetchJson<unknown>(`/api/projects/${projectId}/images/master/${imageId}`, {
    method: "DELETE",
    credentials: "same-origin",
  })
  if (!res.ok) {
    const stage = typeof res.error?.stage === "string" ? res.error.stage : ""
    if (stage === "stale_selection") {
      // Force next refresh to bypass short GET cache and fetch fresh targets.
      invalidateFetchJsonGetCache(masterListPath)
      invalidateFetchJsonGetCache(masterPath)
    }
    throw new Error(formatApiError("Failed to delete image", res.status, res.error))
  }
  invalidateFetchJsonGetCache(masterListPath)
  invalidateFetchJsonGetCache(masterPath)
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
    throw new Error(formatApiError("Failed to update image lock", res.status, res.error))
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
    throw new Error(formatApiError("Failed to crop image", res.status, res.error))
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
    throw new Error(formatApiError("Failed to restore initial image", res.status, res.error))
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
    throw new Error(formatApiError("Failed to load filters", res.status, res.error))
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
    throw new Error(formatApiError("Failed to apply filter", res.status, res.error))
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
    throw new Error(formatApiError("Failed to remove filter", res.status, res.error))
  }
  if (!res.data?.active_image_id) {
    throw new Error("Failed to remove filter (invalid response)")
  }
  invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/master`)
  invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/master/list`)
  invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/filters`)
  return { active_image_id: String(res.data.active_image_id) }
}

export async function getOrCreateFilterWorkingCopy(projectId: string): Promise<
  | {
      exists: false
      stage?: "no_active_image"
    }
  | {
      exists: true
      id: string
      signedUrl: string
      width_px: number
      height_px: number
      storage_path: string
      source_image_id: string | null
      name: string
      isFilterResult: boolean
      stack: Array<{
        id: string
        name: string
        filterType: "pixelate" | "lineart" | "numerate" | "unknown"
        source_image_id: string | null
      }>
    }
> {
  const res = await fetchJson<{
    ok?: boolean
    exists?: boolean
    stage?: string
    id?: string
    signed_url?: string
    width_px?: number
    height_px?: number
    storage_path?: string
    source_image_id?: string | null
    name?: string
    is_filter_result?: boolean
    stack?: Array<{
      id?: string
      name?: string
      filterType?: "pixelate" | "lineart" | "numerate" | "unknown"
      source_image_id?: string | null
    }>
  }>(`/api/projects/${projectId}/images/filter-working-copy`, {
    method: "POST",
    credentials: "same-origin",
  })
  if (!res.ok) {
    throw new Error(formatApiError("Failed to get filter working copy", res.status, res.error))
  }
  if (res.data?.exists === false) {
    return { exists: false, stage: res.data?.stage === "no_active_image" ? "no_active_image" : undefined }
  }
  if (!res.data?.id || !res.data.signed_url) {
    throw new Error("Failed to get filter working copy (missing data)")
  }
  return {
    exists: true,
    id: String(res.data.id),
    signedUrl: String(res.data.signed_url),
    width_px: Number(res.data.width_px ?? 0),
    height_px: Number(res.data.height_px ?? 0),
    storage_path: String(res.data.storage_path ?? ""),
    source_image_id: res.data.source_image_id ?? null,
    name: String(res.data.name ?? ""),
    isFilterResult: Boolean(res.data.is_filter_result),
    stack: Array.isArray(res.data.stack)
      ? res.data.stack
          .filter((row): row is { id: string; name: string; filterType: "pixelate" | "lineart" | "numerate" | "unknown"; source_image_id?: string | null } =>
            Boolean(row?.id && row?.name && row?.filterType)
          )
          .map((row) => ({
            id: String(row.id),
            name: String(row.name),
            filterType: row.filterType,
            source_image_id: row.source_image_id ?? null,
          }))
      : [],
  }
}

