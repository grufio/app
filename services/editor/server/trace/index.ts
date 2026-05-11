/**
 * Trace surface — mutually-exclusive bitmap-to-vector operations
 * (numerate, lineart). One row per project in
 * `project_image_trace`; applying replaces the prior row and
 * tombstones the prior output image.
 *
 * Mirrors the `services/editor/server/filter-variants` pattern for
 * source lookup + activation, but without any of the chain
 * semantics — there is no chain, only a single artefact.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database, Json } from "@/lib/supabase/database.types"
import { TRACE_REGISTRY, type RegisteredTraceId } from "@/lib/editor/trace/registry"
import { lineartSchema } from "@/lib/editor/trace/lineart"
import { numerateSchema } from "@/lib/editor/trace/numerate"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"
import { getEditorTargetImageRow } from "@/lib/supabase/project-images"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { activateProjectImage } from "@/services/editor/server/activate-project-image"
import { lineArtImageAndActivate } from "@/services/editor/server/trace/lineart"
import { numerateImageAndActivate } from "@/services/editor/server/trace/numerate"

export type TraceOpFailure = {
  ok: false
  status: number
  stage:
    | "validation"
    | "active_lookup"
    | "source_lookup"
    | "lock_conflict"
    | "source_download"
    | "numerate_process"
    | "lineart_process"
    | "service_unavailable"
    | "auth"
    | "storage_upload"
    | "db_insert"
    | "transform_sync"
    | "active_switch"
    | "trace_lookup"
    | "trace_upsert"
  reason: string
  code?: string
}

export type ProjectTraceRow = {
  project_id: string
  kind: RegisteredTraceId
  params: Record<string, unknown>
  output_image_id: string
  created_at: string
  updated_at: string
}

export type TraceApplySuccess = {
  ok: true
  trace: ProjectTraceRow
  image_id: string
  width_px: number
  height_px: number
}

export type TraceClearSuccess = {
  ok: true
  active_image_id: string
}

export type TraceGetSuccess = {
  ok: true
  trace: ProjectTraceRow | null
}

function parseTraceKind(value: unknown): RegisteredTraceId | null {
  const v = String(value ?? "").trim().toLowerCase()
  return v in TRACE_REGISTRY ? (v as RegisteredTraceId) : null
}

const TRACE_SCHEMAS = {
  numerate: numerateSchema,
  lineart: lineartSchema,
} as const satisfies Record<RegisteredTraceId, unknown>

const TRACE_HANDLERS = {
  numerate: numerateImageAndActivate,
  lineart: lineArtImageAndActivate,
} as const satisfies Record<RegisteredTraceId, unknown>

function rowToTrace(row: {
  project_id: string
  kind: string
  params: Record<string, unknown> | null
  output_image_id: string
  created_at: string
  updated_at: string
}): ProjectTraceRow | null {
  const kind = parseTraceKind(row.kind)
  if (!kind) return null
  return {
    project_id: row.project_id,
    kind,
    params: row.params ?? {},
    output_image_id: row.output_image_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/**
 * Soft-delete a single project_images row (kind=filter_working_copy)
 * and best-effort remove its storage object. Mirrors the cleanup
 * pattern in `filter-chain-reset.ts`.
 */
async function tombstoneTraceOutput(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  imageId: string
}): Promise<void> {
  const { supabase, projectId, imageId } = args
  const { data: row } = await supabase
    .from("project_images")
    .select("id,storage_bucket,storage_path")
    .eq("project_id", projectId)
    .eq("id", imageId)
    .eq("kind", "filter_working_copy")
    .is("deleted_at", null)
    .maybeSingle()

  await supabase
    .from("project_images")
    .update({ deleted_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("id", imageId)
    .eq("kind", "filter_working_copy")
    .is("deleted_at", null)

  if (row?.storage_path) {
    const service = createSupabaseServiceRoleClient()
    try {
      await service.storage
        .from(row.storage_bucket ?? PROJECT_IMAGES_BUCKET)
        .remove([row.storage_path])
    } catch {
      // Best effort; tombstone is committed, orphan is auditable.
    }
  }
}

export async function applyProjectTrace(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  kind: unknown
  params?: unknown
}): Promise<TraceApplySuccess | TraceOpFailure> {
  const { supabase, projectId } = args
  const kind = parseTraceKind(args.kind)
  if (!kind) {
    return { ok: false, status: 400, stage: "validation", reason: "Unsupported trace kind" }
  }
  const rawParams = (args.params as Record<string, unknown> | null | undefined) ?? {}
  const schema = TRACE_SCHEMAS[kind]
  const parsedParams = schema.safeParse(rawParams)
  if (!parsedParams.success) {
    return { ok: false, status: 400, stage: "validation", reason: `Invalid ${kind} params` }
  }
  const params = parsedParams.data as Record<string, unknown>

  const activeLookup = await getEditorTargetImageRow(supabase, projectId)
  if (activeLookup.error) {
    return { ok: false, status: 400, stage: "active_lookup", reason: activeLookup.error.reason, code: activeLookup.error.code }
  }
  const active = activeLookup.row
  if (!active?.id) {
    return { ok: false, status: 404, stage: "active_lookup", reason: "No active image found" }
  }
  const requestedSourceImageId =
    typeof rawParams.source_image_id === "string" && rawParams.source_image_id.trim()
      ? rawParams.source_image_id.trim()
      : null
  const sourceImageId = requestedSourceImageId ?? String(active.id)
  if (sourceImageId === String(active.id) && active.is_locked) {
    return { ok: false, status: 409, stage: "lock_conflict", reason: "Active image is locked", code: "image_locked" }
  }
  let sourceImageDpi = Number(active.dpi ?? 72)
  if (sourceImageId !== String(active.id)) {
    const { data: sourceRow, error: sourceErr } = await supabase
      .from("project_images")
      .select("dpi")
      .eq("project_id", projectId)
      .eq("id", sourceImageId)
      .is("deleted_at", null)
      .maybeSingle()
    if (sourceErr || !sourceRow) {
      return { ok: false, status: 404, stage: "source_lookup", reason: sourceErr?.message ?? "Source image not found" }
    }
    sourceImageDpi = Number(sourceRow.dpi ?? 72)
  }

  const handler = TRACE_HANDLERS[kind] as (input: {
    supabase: SupabaseClient<Database>
    projectId: string
    sourceImageId: string
    params: Record<string, unknown>
  }) => Promise<
    | { ok: true; id: string; storagePath: string; widthPx: number; heightPx: number }
    | TraceOpFailure
  >
  const created = await handler({ supabase, projectId, sourceImageId, params })
  if (!created.ok) return created

  // Look up the prior trace row's output_image_id (if any) so we can
  // tombstone it after the new row commits — write-then-cut order
  // avoids leaving a project without a Trace row mid-replace.
  const { data: priorRow } = await supabase
    .from("project_image_trace")
    .select("output_image_id")
    .eq("project_id", projectId)
    .maybeSingle()
  const priorOutputId = priorRow?.output_image_id ? String(priorRow.output_image_id) : null

  const { data: upserted, error: upsertErr } = await supabase
    .from("project_image_trace")
    .upsert(
      {
        project_id: projectId,
        kind,
        // Schema-validated record is structurally JSON-safe, but the
        // generated DB types insist on a json-typed value here.
        params: params as Json,
        output_image_id: created.id,
      },
      { onConflict: "project_id" },
    )
    .select("project_id,kind,params,output_image_id,created_at,updated_at")
    .maybeSingle()
  if (upsertErr || !upserted) {
    // Roll back the freshly-created output image so we don't strand
    // bytes in storage.
    await tombstoneTraceOutput({ supabase, projectId, imageId: created.id })
    return {
      ok: false,
      status: 400,
      stage: "trace_upsert",
      reason: upsertErr?.message ?? "Failed to upsert project_image_trace",
      code: (upsertErr as { code?: string } | null)?.code,
    }
  }

  const activation = await activateProjectImage({
    supabase,
    projectId,
    imageId: created.id,
    widthPx: created.widthPx,
    heightPx: created.heightPx,
    imageDpi: sourceImageDpi,
  })
  if (!activation.ok) {
    // The new row is already committed; revert it to leave the
    // project in a consistent state.
    await supabase
      .from("project_image_trace")
      .delete()
      .eq("project_id", projectId)
      .eq("output_image_id", created.id)
    await tombstoneTraceOutput({ supabase, projectId, imageId: created.id })
    return { ok: false, status: activation.status, stage: activation.stage, reason: activation.reason, code: activation.code }
  }

  // New row is committed and active. Now safe to tombstone the
  // prior output image (if there was one).
  if (priorOutputId && priorOutputId !== created.id) {
    await tombstoneTraceOutput({ supabase, projectId, imageId: priorOutputId })
  }

  const trace = rowToTrace({
    project_id: String(upserted.project_id),
    kind: String(upserted.kind),
    params: (upserted.params as Record<string, unknown> | null) ?? null,
    output_image_id: String(upserted.output_image_id),
    created_at: String(upserted.created_at),
    updated_at: String(upserted.updated_at),
  })
  if (!trace) {
    return {
      ok: false,
      status: 500,
      stage: "trace_lookup",
      reason: "Trace row stored unsupported kind",
    }
  }

  return {
    ok: true,
    trace,
    image_id: created.id,
    width_px: created.widthPx,
    height_px: created.heightPx,
  }
}

export async function getProjectTrace(args: {
  supabase: SupabaseClient<Database>
  projectId: string
}): Promise<TraceGetSuccess | TraceOpFailure> {
  const { supabase, projectId } = args
  const { data, error } = await supabase
    .from("project_image_trace")
    .select("project_id,kind,params,output_image_id,created_at,updated_at")
    .eq("project_id", projectId)
    .maybeSingle()
  if (error) {
    return { ok: false, status: 400, stage: "trace_lookup", reason: error.message, code: (error as { code?: string }).code }
  }
  if (!data) return { ok: true, trace: null }
  const trace = rowToTrace({
    project_id: String(data.project_id),
    kind: String(data.kind),
    params: (data.params as Record<string, unknown> | null) ?? null,
    output_image_id: String(data.output_image_id),
    created_at: String(data.created_at),
    updated_at: String(data.updated_at),
  })
  if (!trace) {
    return { ok: false, status: 400, stage: "trace_lookup", reason: "Stored trace row has unsupported kind" }
  }
  return { ok: true, trace }
}

export async function clearProjectTrace(args: {
  supabase: SupabaseClient<Database>
  projectId: string
}): Promise<TraceClearSuccess | TraceOpFailure> {
  const { supabase, projectId } = args
  const current = await getProjectTrace({ supabase, projectId })
  if (!current.ok) return current
  if (!current.trace) {
    // Nothing to clear; report the master image (or whatever the
    // editor's active fallback resolves to) so callers can re-render.
    const fallback = await getEditorTargetImageRow(supabase, projectId)
    if (fallback.error || !fallback.row?.id) {
      return { ok: false, status: 404, stage: "active_lookup", reason: fallback.error?.reason ?? "No active image" }
    }
    return { ok: true, active_image_id: String(fallback.row.id) }
  }

  const traceOutputId = current.trace.output_image_id

  // Delete the trace row first, before tombstoning the output, so a
  // failure between the two leaves the project with a still-active
  // trace row pointing at a still-live image (preferable to a row
  // referencing a tombstoned image).
  const { error: deleteErr } = await supabase
    .from("project_image_trace")
    .delete()
    .eq("project_id", projectId)
  if (deleteErr) {
    return { ok: false, status: 400, stage: "trace_lookup", reason: deleteErr.message, code: (deleteErr as { code?: string }).code }
  }

  // Pick the new active image: walk back to the master (or the
  // pixelate-stack tip if one exists). Mirror filter-variants'
  // remove-then-activate behaviour by going through the editor
  // target resolver, which already prefers filter-working-copy →
  // working-copy → master.
  await tombstoneTraceOutput({ supabase, projectId, imageId: traceOutputId })

  const fallback = await getEditorTargetImageRow(supabase, projectId)
  if (fallback.error || !fallback.row?.id) {
    return { ok: false, status: 400, stage: "active_lookup", reason: fallback.error?.reason ?? "No fallback image after clear" }
  }
  const fallbackImageId = String(fallback.row.id)
  const widthPx = Number(fallback.row.width_px ?? 1)
  const heightPx = Number(fallback.row.height_px ?? 1)
  const dpi = Number(fallback.row.dpi ?? 72)

  const activation = await activateProjectImage({
    supabase,
    projectId,
    imageId: fallbackImageId,
    widthPx,
    heightPx,
    imageDpi: dpi,
  })
  if (!activation.ok) {
    return { ok: false, status: activation.status, stage: activation.stage, reason: activation.reason, code: activation.code }
  }

  return { ok: true, active_image_id: fallbackImageId }
}
