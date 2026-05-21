/**
 * Client-side API wrappers for the Trace surface (F21).
 *
 * Trace is mutually exclusive — a project carries at most one
 * trace artefact at a time (pixelate xor lineart). Applying
 * replaces; clearing falls the canvas back to the master image.
 */
import { fetchJson, invalidateFetchJsonGetCache } from "@/lib/api/http"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

export type TraceKind = RegisteredTraceId

export type ProjectTrace = {
  project_id: string
  kind: TraceKind
  params: Record<string, unknown>
  output_image_id: string
  /** Bitmap (kind=trace_base) holding the source image cropped to
   * the trace cell grid. Null for trace kinds that cover the full
   * source (lineart). */
  base_image_id: string | null
  created_at: string
  updated_at: string
}

/** Signed-URL view of the trace's `base_image_id` row, resolved
 * server-side by the trace route so the editor can render the
 * cropped bitmap as the canvas background without a second
 * round-trip. Null when the trace has no `base_image_id` (lineart)
 * or the underlying row vanished. */
export type TraceBaseImage = {
  id: string
  signedUrl: string
  width_px: number
  height_px: number
}

type ApiErrorPayload = Record<string, unknown> | null

function formatTraceApiError(prefix: string, status: number, payload: ApiErrorPayload): string {
  const stage = typeof payload?.stage === "string" && payload.stage.trim() ? payload.stage : `http_${status}`
  const error =
    typeof payload?.error === "string" && payload.error.trim()
      ? payload.error
      : payload
        ? JSON.stringify(payload)
        : "No JSON error body returned"
  const code = typeof payload?.code === "string" && payload.code.trim() ? ` code=${payload.code}` : ""
  return `${prefix} (${status} ${stage}${code}): ${error}`
}

function tracePath(projectId: string): string {
  return `/api/projects/${projectId}/trace`
}

export type ProjectTraceWithBase = {
  trace: ProjectTrace | null
  baseImage: TraceBaseImage | null
}

/** GET /api/projects/[projectId]/trace — current trace state, plus
 * the resolved signed URL of the trace's base bitmap (when one
 * exists). Returns nulls when no trace row is set. */
export async function getProjectTrace(projectId: string): Promise<ProjectTraceWithBase> {
  const res = await fetchJson<{
    ok?: boolean
    trace?: ProjectTrace | null
    base_image?: TraceBaseImage | null
  }>(tracePath(projectId), {
    method: "GET",
    credentials: "same-origin",
  })
  if (!res.ok) {
    throw new Error(formatTraceApiError("Failed to load trace", res.status, res.error))
  }
  return {
    trace: res.data?.trace ?? null,
    baseImage: res.data?.base_image ?? null,
  }
}

/** POST /api/projects/[projectId]/trace — apply or replace the trace.
 *
 * The server reads the master image's displayed mm size from
 * `project_image_state` directly (see `resolveMasterState`); the
 * `handleApplyTrace` race-closure awaits any pending state-save
 * before this call, so no client hint is needed. */
export async function applyProjectTrace(args: {
  projectId: string
  kind: TraceKind
  params?: Record<string, unknown>
}): Promise<{
  trace: ProjectTrace
  image_id: string
  width_px: number
  height_px: number
  baseImage: TraceBaseImage | null
}> {
  const { projectId, kind, params } = args
  const res = await fetchJson<{
    ok?: boolean
    trace?: ProjectTrace
    image_id?: string
    width_px?: number
    height_px?: number
    base_image?: TraceBaseImage | null
  }>(tracePath(projectId), {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind,
      params: params ?? {},
    }),
  })
  if (!res.ok) {
    throw new Error(formatTraceApiError("Failed to apply trace", res.status, res.error))
  }
  if (!res.data?.trace || !res.data.image_id) {
    throw new Error("Failed to apply trace (invalid response)")
  }
  invalidateFetchJsonGetCache(tracePath(projectId))
  return {
    trace: res.data.trace,
    image_id: String(res.data.image_id),
    width_px: Number(res.data.width_px ?? 0),
    height_px: Number(res.data.height_px ?? 0),
    baseImage: res.data.base_image ?? null,
  }
}

/** DELETE /api/projects/[projectId]/trace — clear the active trace. */
export async function clearProjectTrace(projectId: string): Promise<{ active_image_id: string }> {
  const res = await fetchJson<{ ok?: boolean; active_image_id?: string }>(tracePath(projectId), {
    method: "DELETE",
    credentials: "same-origin",
  })
  if (!res.ok) {
    throw new Error(formatTraceApiError("Failed to clear trace", res.status, res.error))
  }
  if (!res.data?.active_image_id) {
    throw new Error("Failed to clear trace (invalid response)")
  }
  invalidateFetchJsonGetCache(tracePath(projectId))
  return { active_image_id: String(res.data.active_image_id) }
}
