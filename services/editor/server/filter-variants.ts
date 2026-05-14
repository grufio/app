import type { SupabaseClient } from "@supabase/supabase-js"

import { IMAGE_KIND, resolveImageKind } from "@/lib/editor/image-kind"
import type { Database } from "@/lib/supabase/database.types"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { getEditorTargetImageRow } from "@/lib/supabase/project-images"
import { activateProjectImageOnly } from "@/services/editor/server/activate-project-image"
import { appendProjectImageFilter } from "@/services/editor/server/filter-chain"
import {
  bwHardImageAndActivate,
  bwSoftImageAndActivate,
  bwWarmImageAndActivate,
} from "@/services/editor/server/filters/bw"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"
import { bwHardSchema } from "@/lib/editor/filters/bw-hard"
import { bwSoftSchema } from "@/lib/editor/filters/bw-soft"
import { bwWarmSchema } from "@/lib/editor/filters/bw-warm"
import { FILTER_REGISTRY, type RegisteredFilterId } from "@/lib/editor/filters/registry"

export type SupportedFilterType = RegisteredFilterId

export type FilterOpFailure = {
  ok: false
  status: number
  stage:
    | "validation"
    | "active_lookup"
    | "source_lookup"
    | "lock_conflict"
    | "source_download"
    | "bw_process"
    | "service_unavailable"
    | "auth"
    | "storage_upload"
    | "db_insert"
    | "chain_append"
    | "transform_sync"
    | "active_switch"
    | "filter_lookup"
    | "rebuild"
  reason: string
  code?: string
}

export type FilterStackItem = {
  id: string
  input_image_id: string
  output_image_id: string
  filter_type: SupportedFilterType
  filter_params: Record<string, unknown>
  stack_order: number
  is_hidden: boolean
  created_at: string
}

export type FilterApplySuccess = {
  ok: true
  item: FilterStackItem
  image_id: string
  width_px: number
  height_px: number
}

export type FilterRemoveSuccess = {
  ok: true
  active_image_id: string
}

function parseFilterType(value: unknown): SupportedFilterType | null {
  const v = String(value ?? "").trim().toLowerCase()
  return v in FILTER_REGISTRY ? (v as SupportedFilterType) : null
}

// Schema-per-filter map. Used by `normalizeFilterParams` to apply
// defaults / coerce strings without a per-filter if/else cascade.
// The B&W filters all have empty schemas (no user-config params).
const FILTER_SCHEMAS = {
  bw_hard: bwHardSchema,
  bw_soft: bwSoftSchema,
  bw_warm: bwWarmSchema,
} as const satisfies Record<SupportedFilterType, unknown>

// Handler-per-filter map. Each entry is the per-filter pipeline
// (Supabase lookup → HTTP call → upload → DB insert) — they all share
// the `FilterResult` shape, so the dispatch can stay structural.
const FILTER_HANDLERS = {
  bw_hard: bwHardImageAndActivate,
  bw_soft: bwSoftImageAndActivate,
  bw_warm: bwWarmImageAndActivate,
} as const satisfies Record<SupportedFilterType, unknown>

function normalizeFilterParams(filterType: SupportedFilterType, params: unknown): Record<string, unknown> {
  const input = (params as Record<string, unknown> | null | undefined) ?? {}
  const schema = FILTER_SCHEMAS[filterType]
  const parsed = schema.safeParse(input)
  return parsed.success ? (parsed.data as Record<string, unknown>) : (schema.parse({}) as Record<string, unknown>)
}

async function createDerivedImageFromSource(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  sourceImageId: string
  filterType: SupportedFilterType
  params: Record<string, unknown>
}): Promise<{ ok: true; imageId: string; widthPx: number; heightPx: number; storagePath: string } | FilterOpFailure> {
  const { supabase, projectId, sourceImageId, filterType, params } = args
  const schema = FILTER_SCHEMAS[filterType]
  const handler = FILTER_HANDLERS[filterType] as (input: {
    supabase: SupabaseClient<Database>
    projectId: string
    sourceImageId: string
    params: Record<string, unknown>
  }) => Promise<
    | { ok: true; id: string; storagePath: string; widthPx: number; heightPx: number }
    | FilterOpFailure
  >
  const result = await handler({
    supabase,
    projectId,
    sourceImageId,
    params: schema.parse(params) as Record<string, unknown>,
  })
  if (!result.ok) return result
  return {
    ok: true,
    imageId: result.id,
    widthPx: result.widthPx,
    heightPx: result.heightPx,
    storagePath: result.storagePath,
  }
}

async function removeImageRowsAndStorage(args: {
  supabase: SupabaseClient<Database>
  imageIds: string[]
}): Promise<void> {
  const ids = Array.from(new Set(args.imageIds.filter(Boolean)))
  if (!ids.length) return
  const { supabase } = args
  const service = createSupabaseServiceRoleClient()
  const { data: rows } = await supabase
    .from("project_images")
    .select("id,kind,storage_bucket,storage_path,name,source_image_id")
    .in("id", ids)
    .is("deleted_at", null)
  const deletable = (rows ?? []).filter((r) => resolveImageKind(r) !== IMAGE_KIND.MASTER)
  if (!deletable.length) return
  for (const row of deletable) {
    if (row.storage_path) {
      await service.storage.from(row.storage_bucket ?? PROJECT_IMAGES_BUCKET).remove([row.storage_path])
    }
  }
  await supabase
    .from("project_images")
    .delete()
    .in(
      "id",
      deletable.map((r) => r.id)
    )
}

export async function listProjectImageFilters(args: {
  supabase: SupabaseClient<Database>
  projectId: string
}): Promise<{ ok: true; items: FilterStackItem[] } | FilterOpFailure> {
  const { supabase, projectId } = args
  const { data, error } = await supabase
    .from("project_image_filters")
    .select("id,input_image_id,output_image_id,filter_type,filter_params,stack_order,is_hidden,created_at")
    .eq("project_id", projectId)
    .order("stack_order", { ascending: true })
  if (error) return { ok: false, status: 400, stage: "filter_lookup", reason: error.message, code: (error as { code?: string }).code }
  const items: FilterStackItem[] = []
  for (const row of data ?? []) {
    const filterType = parseFilterType(row.filter_type)
    if (!filterType) {
      return { ok: false, status: 400, stage: "filter_lookup", reason: "Unsupported filter type in stored stack" }
    }
    items.push({
      id: String(row.id),
      input_image_id: String(row.input_image_id),
      output_image_id: String(row.output_image_id),
      filter_type: filterType,
      filter_params: (row.filter_params as Record<string, unknown> | null) ?? {},
      stack_order: Number(row.stack_order),
      is_hidden: Boolean(row.is_hidden),
      created_at: String(row.created_at),
    })
  }
  return { ok: true, items }
}

export async function applyProjectImageFilter(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  filterType: unknown
  filterParams?: unknown
}): Promise<FilterApplySuccess | FilterOpFailure> {
  const { supabase, projectId } = args
  const filterType = parseFilterType(args.filterType)
  if (!filterType) return { ok: false, status: 400, stage: "validation", reason: "Unsupported filter type" }
  const rawParams = (args.filterParams as Record<string, unknown> | null | undefined) ?? {}
  const params = normalizeFilterParams(filterType, rawParams)

  const activeLookup = await getEditorTargetImageRow(supabase, projectId)
  if (activeLookup.error) {
    return {
      ok: false,
      status: 400,
      stage: "active_lookup",
      reason: activeLookup.error.reason,
      code: activeLookup.error.code,
    }
  }
  const active = activeLookup.row
  if (!active?.id) return { ok: false, status: 404, stage: "active_lookup", reason: "No active image found" }
  const requestedSourceImageId =
    typeof rawParams.source_image_id === "string" && rawParams.source_image_id.trim() ? rawParams.source_image_id.trim() : null
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

  const created = await createDerivedImageFromSource({
    supabase,
    projectId,
    sourceImageId,
    filterType,
    params,
  })
  if (!created.ok) return created

  const appended = await appendProjectImageFilter({
    supabase,
    projectId,
    inputImageId: sourceImageId,
    outputImageId: created.imageId,
    filterType,
    filterParams: params,
  })
  if (!appended.ok) {
    await removeImageRowsAndStorage({ supabase, imageIds: [created.imageId] })
    return { ok: false, status: 400, stage: appended.stage, reason: appended.reason, code: appended.code }
  }

  const { data: inserted, error: filterErr } = await supabase
    .from("project_image_filters")
    .select("id,input_image_id,output_image_id,filter_type,filter_params,stack_order,is_hidden,created_at")
    .eq("project_id", projectId)
    .eq("output_image_id", created.imageId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (filterErr || !inserted) {
    await removeImageRowsAndStorage({ supabase, imageIds: [created.imageId] })
    return {
      ok: false,
      status: 400,
      stage: "db_insert",
      reason: filterErr?.message ?? "Failed to load appended filter row",
      code: (filterErr as { code?: string } | null)?.code,
    }
  }

  const insertedFilterId = String(inserted.id ?? "")
  const cleanupInsertedFilter = async () => {
    if (insertedFilterId) {
      await supabase.from("project_image_filters").delete().eq("id", insertedFilterId).eq("project_id", projectId)
      return
    }
    await supabase.from("project_image_filters").delete().eq("project_id", projectId).eq("output_image_id", created.imageId)
  }

  const activation = await activateProjectImageOnly({
    supabase,
    projectId,
    imageId: created.imageId,
  })
  if (!activation.ok) {
    await cleanupInsertedFilter()
    await removeImageRowsAndStorage({ supabase, imageIds: [created.imageId] })
    return { ok: false, status: activation.status, stage: activation.stage, reason: activation.reason, code: activation.code }
  }

  return {
    ok: true,
    item: {
      id: insertedFilterId,
      input_image_id: String(inserted.input_image_id),
      output_image_id: String(inserted.output_image_id),
      filter_type: filterType,
      filter_params: (inserted.filter_params as Record<string, unknown> | null) ?? {},
      stack_order: Number(inserted.stack_order),
      is_hidden: Boolean(inserted.is_hidden),
      created_at: String(inserted.created_at),
    },
    image_id: created.imageId,
    width_px: created.widthPx,
    height_px: created.heightPx,
  }
}

export async function removeProjectImageFilter(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  filterId: string
}): Promise<FilterRemoveSuccess | FilterOpFailure> {
  const { supabase, projectId, filterId } = args
  const listed = await listProjectImageFilters({ supabase, projectId })
  if (!listed.ok) return listed
  const filters = listed.items
  const idx = filters.findIndex((f) => f.id === filterId)
  if (idx < 0) return { ok: false, status: 404, stage: "filter_lookup", reason: "Filter not found" }

  const target = filters[idx]
  const after = filters.slice(idx + 1)
  const newArtifacts: Array<{ imageId: string; widthPx: number; heightPx: number }> = []
  const oldOutputIdsToDelete = [target.output_image_id, ...after.map((f) => f.output_image_id)]

  let currentImageId = idx > 0 ? filters[idx - 1].output_image_id : target.input_image_id

  // Build replacement outputs for all following filters first.
  for (const f of after) {
    const filterType = parseFilterType(f.filter_type)
    if (!filterType) {
      await removeImageRowsAndStorage({
        supabase,
        imageIds: newArtifacts.map((x) => x.imageId),
      })
      return { ok: false, status: 400, stage: "rebuild", reason: "Unsupported filter type in chain" }
    }
    const created = await createDerivedImageFromSource({
      supabase,
      projectId,
      sourceImageId: currentImageId,
      filterType,
      params: normalizeFilterParams(filterType, f.filter_params),
    })
    if (!created.ok) {
      await removeImageRowsAndStorage({
        supabase,
        imageIds: newArtifacts.map((x) => x.imageId),
      })
      return created
    }
    newArtifacts.push({ imageId: created.imageId, widthPx: created.widthPx, heightPx: created.heightPx })
    currentImageId = created.imageId
  }

  // Build the rewire payload for the atomic RPC. Each entry is a
  // downstream filter that needs its (input, output) updated to the
  // freshly-rebuilt artifact. The RPC then deletes the target row and
  // compacts stack_order to 1..N — all within one advisory lock.
  const rewires = after.map((f, i) => {
    const prevImageId = i === 0 ? (idx > 0 ? filters[idx - 1].output_image_id : target.input_image_id) : newArtifacts[i - 1].imageId
    return {
      id: f.id,
      input_image_id: prevImageId,
      output_image_id: newArtifacts[i].imageId,
    }
  })

  const { error: removeErr } = await supabase.rpc("remove_project_image_filter", {
    p_project_id: projectId,
    p_filter_id: target.id,
    p_rewires: rewires,
  })
  if (removeErr) {
    await removeImageRowsAndStorage({ supabase, imageIds: newArtifacts.map((x) => x.imageId) })
    return {
      ok: false,
      status: 400,
      stage: "rebuild",
      reason: removeErr.message,
      code: (removeErr as { code?: string }).code,
    }
  }

  const activeImageId = after.length > 0 ? newArtifacts[newArtifacts.length - 1].imageId : currentImageId
  const { data: activeRow, error: activeRowErr } = await supabase
    .from("project_images")
    .select("id")
    .eq("project_id", projectId)
    .eq("id", activeImageId)
    .is("deleted_at", null)
    .maybeSingle()
  if (activeRowErr || !activeRow) {
    return { ok: false, status: 400, stage: "active_lookup", reason: activeRowErr?.message ?? "Active image row missing" }
  }

  const activation = await activateProjectImageOnly({
    supabase,
    projectId,
    imageId: activeImageId,
  })
  if (!activation.ok) return { ok: false, status: activation.status, stage: activation.stage, reason: activation.reason, code: activation.code }

  await removeImageRowsAndStorage({ supabase, imageIds: oldOutputIdsToDelete })

  return { ok: true, active_image_id: activeImageId }
}

