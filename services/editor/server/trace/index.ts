/**
 * Trace surface — mutually-exclusive bitmap-to-vector operations
 * (pixelate, lineart). One row per project in
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
import { pixelateSchema } from "@/lib/editor/trace/pixelate"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"
import { getEditorTargetImageRow, resolveEditorTargetImageRows } from "@/lib/supabase/project-images"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { activateProjectImageOnly } from "@/services/editor/server/activate-project-image"
import { lineArtImageAndActivate } from "@/services/editor/server/trace/lineart"
import { pixelateImageAndActivate } from "@/services/editor/server/trace/pixelate"

export type TraceOpFailure = {
  ok: false
  status: number
  stage:
    | "validation"
    | "active_lookup"
    | "source_lookup"
    | "lock_conflict"
    | "source_download"
    | "pixelate_process"
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
  /** Pixelate writes a paired bitmap (the source cropped to the
   * cell grid) as a `trace_base` image row and links it here.
   * Null for trace kinds without a crop (lineart). */
  base_image_id: string | null
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
  pixelate: pixelateSchema,
  lineart: lineartSchema,
} as const satisfies Record<RegisteredTraceId, unknown>

const TRACE_HANDLERS = {
  pixelate: pixelateImageAndActivate,
  lineart: lineArtImageAndActivate,
} as const satisfies Record<RegisteredTraceId, unknown>

function rowToTrace(row: {
  project_id: string
  kind: string
  params: Record<string, unknown> | null
  output_image_id: string
  base_image_id: string | null
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
    base_image_id: row.base_image_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/**
 * Soft-delete a single trace-owned project_images row (kind
 * `trace_output` or `trace_base`) and best-effort remove its
 * storage object. Mirrors the cleanup pattern in
 * `filter-chain-reset.ts`. Both trace kinds share this helper
 * because the lifecycle is identical — the only difference is
 * which row table column points at which.
 */
async function tombstoneTraceImage(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  imageId: string
  kind: "trace_output" | "trace_base"
}): Promise<void> {
  const { supabase, projectId, imageId, kind } = args
  const { data: row } = await supabase
    .from("project_images")
    .select("id,storage_bucket,storage_path")
    .eq("project_id", projectId)
    .eq("id", imageId)
    .eq("kind", kind)
    .is("deleted_at", null)
    .maybeSingle()

  await supabase
    .from("project_images")
    .update({ deleted_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("id", imageId)
    .eq("kind", kind)
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
    const issues = parsedParams.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ")
    return {
      ok: false,
      status: 400,
      stage: "validation",
      reason: `Invalid ${kind} params: ${issues || "unknown"}`,
    }
  }
  const params = parsedParams.data as Record<string, unknown>

  // Trace operates on the BITMAP that sits "below" the filter chain
  // — the filter-chain tip if any filters exist, otherwise the
  // master / working-copy row. The active image (used everywhere
  // else in the editor) may be the previous trace's SVG output,
  // which is the wrong source: trace pipelines want bitmap pixels,
  // and re-using a prior trace would feed SVG bytes into the
  // Python image-decode step.
  //
  // Order of preference:
  //   1. explicit `source_image_id` in params (legacy override)
  //   2. latest filter-chain output (project_image_filters)
  //   3. project's working_copy (kind='working_copy')
  //   4. master image (kind='master')
  const requestedSourceImageId =
    typeof rawParams.source_image_id === "string" && rawParams.source_image_id.trim()
      ? rawParams.source_image_id.trim()
      : null

  let sourceImageId: string
  let sourceIsLocked = false

  const resolveSourceById = async (
    imageId: string,
  ): Promise<{ ok: true; isLocked: boolean } | { ok: false; reason: string; code?: string }> => {
    const { data: row, error } = await supabase
      .from("project_images")
      .select("is_locked")
      .eq("project_id", projectId)
      .eq("id", imageId)
      .is("deleted_at", null)
      .maybeSingle()
    if (error || !row) {
      return { ok: false, reason: error?.message ?? "Source image not found", code: error?.code }
    }
    return { ok: true, isLocked: Boolean(row.is_locked) }
  }

  if (requestedSourceImageId) {
    sourceImageId = requestedSourceImageId
    const lookup = await resolveSourceById(sourceImageId)
    if (!lookup.ok) {
      return { ok: false, status: 404, stage: "source_lookup", reason: lookup.reason, code: lookup.code }
    }
    sourceIsLocked = lookup.isLocked
  } else {
    // Walk the filter chain for its tip output. project_image_filters
    // is filter-chain rows only; pixelate / lineart trace rows live
    // on project_image_trace and never appear here.
    const { data: chainRows } = await supabase
      .from("project_image_filters")
      .select("output_image_id,stack_order")
      .eq("project_id", projectId)
      .order("stack_order", { ascending: false })
      .limit(1)
    const chainTipId = chainRows?.[0]?.output_image_id ? String(chainRows[0].output_image_id) : null

    if (chainTipId) {
      sourceImageId = chainTipId
      const lookup = await resolveSourceById(sourceImageId)
      if (!lookup.ok) {
        return { ok: false, status: 404, stage: "source_lookup", reason: lookup.reason, code: lookup.code }
      }
      sourceIsLocked = lookup.isLocked
    } else {
      // No filter chain — fall back to the same "active editor
      // target" resolver the Filter pipeline uses, so trace and
      // filter always agree on which bitmap to operate on. The old
      // hand-rolled query (kind in working_copy/master, sorted by
      // newest) ignored the active-image state and could pick a
      // stale working_copy from a previous master upload.
      const lookup = await resolveEditorTargetImageRows(supabase, projectId)
      if (lookup.error) {
        return { ok: false, status: 400, stage: "active_lookup", reason: lookup.error.reason, code: lookup.error.code }
      }
      // `preferredWorking` is the working_copy of the active master.
      // If none exists yet (no filter has ever been opened on this
      // project), fall back to the active master directly.
      let bitmapRowId: string | null = null
      let bitmapIsLocked = false
      if (lookup.preferredWorking?.id) {
        bitmapRowId = String(lookup.preferredWorking.id)
        bitmapIsLocked = Boolean(lookup.preferredWorking.is_locked)
      } else {
        const { data: masterRow, error: masterErr } = await supabase
          .from("project_images")
          .select("id,is_locked")
          .eq("project_id", projectId)
          .eq("kind", "master")
          .eq("is_active", true)
          .is("deleted_at", null)
          .maybeSingle()
        if (masterErr) {
          return { ok: false, status: 400, stage: "active_lookup", reason: masterErr.message, code: masterErr.code }
        }
        if (masterRow?.id) {
          bitmapRowId = String(masterRow.id)
          bitmapIsLocked = Boolean(masterRow.is_locked)
        }
      }
      if (!bitmapRowId) {
        return { ok: false, status: 404, stage: "active_lookup", reason: "No bitmap source image found for trace" }
      }
      sourceImageId = bitmapRowId
      sourceIsLocked = bitmapIsLocked
    }
  }

  if (sourceIsLocked) {
    return { ok: false, status: 409, stage: "lock_conflict", reason: "Trace source image is locked", code: "image_locked" }
  }

  const handler = TRACE_HANDLERS[kind] as (input: {
    supabase: SupabaseClient<Database>
    projectId: string
    sourceImageId: string
    params: Record<string, unknown>
  }) => Promise<
    | {
        ok: true
        id: string
        storagePath: string
        widthPx: number
        heightPx: number
        baseId?: string
      }
    | TraceOpFailure
  >
  const created = await handler({ supabase, projectId, sourceImageId, params })
  if (!created.ok) return created
  const newBaseId = created.baseId ?? null

  // Look up the prior trace row's output + base ids (if any) so we
  // can tombstone them after the new row commits — write-then-cut
  // order avoids leaving a project without a Trace row mid-replace.
  const { data: priorRow } = await supabase
    .from("project_image_trace")
    .select("output_image_id,base_image_id")
    .eq("project_id", projectId)
    .maybeSingle()
  const priorOutputId = priorRow?.output_image_id ? String(priorRow.output_image_id) : null
  const priorBaseId = priorRow?.base_image_id ? String(priorRow.base_image_id) : null

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
        base_image_id: newBaseId,
      },
      { onConflict: "project_id" },
    )
    .select("project_id,kind,params,output_image_id,base_image_id,created_at,updated_at")
    .maybeSingle()
  if (upsertErr || !upserted) {
    // Roll back the freshly-created images so we don't strand bytes
    // in storage.
    await tombstoneTraceImage({ supabase, projectId, imageId: created.id, kind: "trace_output" })
    if (newBaseId) {
      await tombstoneTraceImage({ supabase, projectId, imageId: newBaseId, kind: "trace_base" })
    }
    return {
      ok: false,
      status: 400,
      stage: "trace_upsert",
      reason: upsertErr?.message ?? "Failed to upsert project_image_trace",
      code: (upsertErr as { code?: string } | null)?.code,
    }
  }

  const activation = await activateProjectImageOnly({
    supabase,
    projectId,
    imageId: created.id,
  })
  if (!activation.ok) {
    // The new row is already committed; revert it to leave the
    // project in a consistent state.
    await supabase
      .from("project_image_trace")
      .delete()
      .eq("project_id", projectId)
      .eq("output_image_id", created.id)
    await tombstoneTraceImage({ supabase, projectId, imageId: created.id, kind: "trace_output" })
    if (newBaseId) {
      await tombstoneTraceImage({ supabase, projectId, imageId: newBaseId, kind: "trace_base" })
    }
    return { ok: false, status: activation.status, stage: activation.stage, reason: activation.reason, code: activation.code }
  }

  // New row is committed and active. Now safe to tombstone the
  // prior trace artefacts (if any).
  if (priorOutputId && priorOutputId !== created.id) {
    await tombstoneTraceImage({ supabase, projectId, imageId: priorOutputId, kind: "trace_output" })
  }
  if (priorBaseId && priorBaseId !== newBaseId) {
    await tombstoneTraceImage({ supabase, projectId, imageId: priorBaseId, kind: "trace_base" })
  }

  // Pixelate-apply is non-destructive (post the working-copy refactor):
  // the project_image_state row at working_copy.id is NOT mutated by
  // applying a trace. The user's resize stays exactly where they put
  // it. The trace is an overlay on top of the existing working_copy
  // display rect; the bitmap layer + SVG sit at master-state dims, so
  // any 2mm floor-grid remainder shows the working_copy underneath.

  const trace = rowToTrace({
    project_id: String(upserted.project_id),
    kind: String(upserted.kind),
    params: (upserted.params as Record<string, unknown> | null) ?? null,
    output_image_id: String(upserted.output_image_id),
    base_image_id: upserted.base_image_id ? String(upserted.base_image_id) : null,
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
    .select("project_id,kind,params,output_image_id,base_image_id,created_at,updated_at")
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
    base_image_id: data.base_image_id ? String(data.base_image_id) : null,
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
  const traceBaseId = current.trace.base_image_id

  // Delete the trace row first, before tombstoning the images, so a
  // failure between the two leaves the project with a still-active
  // trace row pointing at still-live images (preferable to a row
  // referencing tombstoned ones; and the trace row's ON DELETE
  // RESTRICT on base_image_id blocks tombstoning the base before
  // the row goes).
  const { error: deleteErr } = await supabase
    .from("project_image_trace")
    .delete()
    .eq("project_id", projectId)
  if (deleteErr) {
    return { ok: false, status: 400, stage: "trace_lookup", reason: deleteErr.message, code: (deleteErr as { code?: string }).code }
  }

  // Clear-trace is non-destructive (post the working-copy refactor):
  // the working_copy's project_image_state row is NOT touched. The
  // user's resize size stays exactly where they put it. Removing the
  // trace just removes the overlay layer; the underlying working_copy
  // is still displayed at its current size.

  // Pick the new active image: walk back to the working_copy (or the
  // filter chain tip if any). Mirror filter-variants' remove-then-
  // activate behaviour by going through the editor target resolver,
  // which already prefers filter-working-copy → working-copy → master.
  await tombstoneTraceImage({ supabase, projectId, imageId: traceOutputId, kind: "trace_output" })
  if (traceBaseId) {
    await tombstoneTraceImage({ supabase, projectId, imageId: traceBaseId, kind: "trace_base" })
  }

  const fallback = await getEditorTargetImageRow(supabase, projectId)
  if (fallback.error || !fallback.row?.id) {
    return { ok: false, status: 400, stage: "active_lookup", reason: fallback.error?.reason ?? "No fallback image after clear" }
  }
  const fallbackImageId = String(fallback.row.id)

  const activation = await activateProjectImageOnly({
    supabase,
    projectId,
    imageId: fallbackImageId,
  })
  if (!activation.ok) {
    return { ok: false, status: activation.status, stage: activation.stage, reason: activation.reason, code: activation.code }
  }

  return { ok: true, active_image_id: fallbackImageId }
}
