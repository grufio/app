/**
 * Client-side API wrappers for the Trace surface (F21).
 *
 * Trace is mutually exclusive — a project carries at most one
 * trace artefact at a time (numerate xor lineart). Applying
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
  created_at: string
  updated_at: string
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

/** GET /api/projects/[projectId]/trace — current trace state, or null. */
export async function getProjectTrace(projectId: string): Promise<ProjectTrace | null> {
  const res = await fetchJson<{ ok?: boolean; trace?: ProjectTrace | null }>(tracePath(projectId), {
    method: "GET",
    credentials: "same-origin",
  })
  if (!res.ok) {
    throw new Error(formatTraceApiError("Failed to load trace", res.status, res.error))
  }
  return res.data?.trace ?? null
}

/** POST /api/projects/[projectId]/trace — apply or replace the trace. */
export async function applyProjectTrace(args: {
  projectId: string
  kind: TraceKind
  params?: Record<string, unknown>
}): Promise<{ trace: ProjectTrace; image_id: string; width_px: number; height_px: number }> {
  const { projectId, kind, params } = args
  const res = await fetchJson<{
    ok?: boolean
    trace?: ProjectTrace
    image_id?: string
    width_px?: number
    height_px?: number
  }>(tracePath(projectId), {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, params: params ?? {} }),
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
