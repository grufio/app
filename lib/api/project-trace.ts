/**
 * Client-side API wrappers for the Trace surface (F21).
 *
 * Trace is mutually exclusive — a project carries at most one
 * trace artefact at a time (pixelate xor linerate). Applying
 * replaces; clearing falls the canvas back to the master image.
 */
import { invalidateProjectMutationCaches } from "@/lib/api/cache-invalidation"
import { formatApiError } from "@/lib/api/error-formatting"
import { fetchJson } from "@/lib/api/http"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

export type TraceKind = RegisteredTraceId

export type ProjectTrace = {
  project_id: string
  kind: TraceKind
  params: Record<string, unknown>
  output_image_id: string
  /** Bitmap (kind=trace_base) holding the source image cropped to
   * the trace cell grid. Null for trace kinds that cover the full
   * source (linerate). */
  base_image_id: string | null
  /** Unique palette chip indices the filter-service snap step emitted —
   * positions in the `readTracePalette(mode)` array sent to the service
   * (colour = munsell tier ++ lab_grays appended; bw = lab_grays), NOT the DB
   * `palette_index` column. Sorted ascending. Null for legacy traces
   * pre-migration and for linerate (no palette). */
  palette_indices_used: number[] | null
  /** The trace's own frozen display rect (µpx, text-encoded). The
   * master/working_copy display rect that was authoritative when the
   * trace was applied; the overlay renders from this rect decoupled
   * from the live canvas transform (Invariant 2, consumed in stage 3).
   * "0" is the legacy/linerate signal — no fixed rect, render via the
   * master-state path. Wrap with BigInt() on read. */
  display_x_px_u: string
  display_y_px_u: string
  display_width_px_u: string
  display_height_px_u: string
  created_at: string
  updated_at: string
}

/** Signed-URL view of the trace's `base_image_id` row, resolved
 * server-side by the trace route so the editor can render the
 * cropped bitmap as the canvas background without a second
 * round-trip. Null when the trace has no `base_image_id` (linerate)
 * or the underlying row vanished. */
export type TraceBaseImage = {
  id: string
  signedUrl: string
  width_px: number
  height_px: number
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
    throw new Error(formatApiError("Failed to load trace", res.status, res.error))
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
    throw new Error(formatApiError("Failed to apply trace", res.status, res.error))
  }
  if (!res.data?.trace || !res.data.image_id) {
    throw new Error("Failed to apply trace (invalid response)")
  }
  invalidateProjectMutationCaches(projectId, ["trace"])
  return {
    trace: res.data.trace,
    image_id: String(res.data.image_id),
    width_px: Number(res.data.width_px ?? 0),
    height_px: Number(res.data.height_px ?? 0),
    baseImage: res.data.base_image ?? null,
  }
}

/** POST /api/projects/[projectId]/trace/preview — run the linerate trace at
 * 0.5 MP and return the un-persisted SVG string. No side effects (no upload,
 * no DB row, no activation); the dialog renders the SVG inline. Only linerate
 * is supported. */
export async function previewProjectTrace(args: {
  projectId: string
  kind: TraceKind
  params?: Record<string, unknown>
}): Promise<{ svg: string; width_px: number; height_px: number }> {
  const { projectId, kind, params } = args
  const res = await fetchJson<{
    ok?: boolean
    svg?: string
    width_px?: number
    height_px?: number
  }>(`${tracePath(projectId)}/preview`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, params: params ?? {} }),
  })
  if (!res.ok) {
    throw new Error(formatApiError("Failed to preview trace", res.status, res.error))
  }
  if (typeof res.data?.svg !== "string" || !res.data.svg) {
    throw new Error("Failed to preview trace (invalid response)")
  }
  return {
    svg: res.data.svg,
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
    throw new Error(formatApiError("Failed to clear trace", res.status, res.error))
  }
  if (!res.data?.active_image_id) {
    throw new Error("Failed to clear trace (invalid response)")
  }
  invalidateProjectMutationCaches(projectId, ["trace"])
  return { active_image_id: String(res.data.active_image_id) }
}
