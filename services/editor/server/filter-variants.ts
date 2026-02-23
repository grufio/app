import crypto from "node:crypto"

import sharp from "sharp"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { activateMasterWithState } from "@/lib/supabase/project-images"

export type SupportedFilterType = "grayscale" | "invert" | "blur" | "brightness"

export type FilterOpFailure = {
  ok: false
  status: number
  stage:
    | "validation"
    | "active_lookup"
    | "lock_conflict"
    | "source_download"
    | "filter_process"
    | "storage_upload"
    | "db_insert"
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
  if (v === "grayscale" || v === "invert" || v === "blur" || v === "brightness") return v
  return null
}

function normalizeFilterParams(filterType: SupportedFilterType, params: unknown): Record<string, unknown> {
  if (filterType === "blur") {
    const sigmaRaw = Number((params as { sigma?: unknown } | null | undefined)?.sigma ?? 1)
    const sigma = Number.isFinite(sigmaRaw) ? Math.min(20, Math.max(0.1, sigmaRaw)) : 1
    return { sigma }
  }
  if (filterType === "brightness") {
    const valueRaw = Number((params as { value?: unknown } | null | undefined)?.value ?? 1.1)
    const value = Number.isFinite(valueRaw) ? Math.min(3, Math.max(0.1, valueRaw)) : 1.1
    return { value }
  }
  return {}
}

async function applyFilterToBuffer(args: {
  input: Buffer
  format: string | null | undefined
  filterType: SupportedFilterType
  params: Record<string, unknown>
}): Promise<{ buffer: Buffer; format: "jpeg" | "png" | "webp"; width: number; height: number }> {
  const { input, format, filterType, params } = args
  const outFormat: "jpeg" | "png" | "webp" = format === "jpg" || format === "jpeg" ? "jpeg" : format === "webp" ? "webp" : "png"
  let pipeline = sharp(input)
  if (filterType === "grayscale") pipeline = pipeline.grayscale()
  if (filterType === "invert") pipeline = pipeline.negate()
  if (filterType === "blur") pipeline = pipeline.blur(Number(params.sigma ?? 1))
  if (filterType === "brightness") pipeline = pipeline.modulate({ brightness: Number(params.value ?? 1.1) })
  const buffer = await pipeline.toFormat(outFormat).toBuffer()
  const meta = await sharp(buffer).metadata()
  const width = Number(meta.width ?? 0)
  const height = Number(meta.height ?? 0)
  if (!(width > 0 && height > 0)) {
    throw new Error("Invalid filtered output dimensions")
  }
  return { buffer, format: outFormat, width, height }
}

async function createDerivedImageFromSource(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  sourceImageId: string
  filterType: SupportedFilterType
  params: Record<string, unknown>
}): Promise<{ ok: true; imageId: string; widthPx: number; heightPx: number; storagePath: string } | FilterOpFailure> {
  const { supabase, projectId, sourceImageId, filterType, params } = args
  const { data: src, error: srcErr } = await supabase
    .from("project_images")
    .select("id,name,format,width_px,height_px,storage_bucket,storage_path,is_locked,deleted_at")
    .eq("project_id", projectId)
    .eq("id", sourceImageId)
    .is("deleted_at", null)
    .maybeSingle()
  if (srcErr) return { ok: false, status: 400, stage: "active_lookup", reason: srcErr.message, code: (srcErr as { code?: string }).code }
  if (!src?.storage_path) return { ok: false, status: 404, stage: "active_lookup", reason: "Source image not found" }
  if (src.is_locked) return { ok: false, status: 409, stage: "lock_conflict", reason: "Active image is locked", code: "image_locked" }

  const service = createSupabaseServiceRoleClient()
  const sourceBucket = src.storage_bucket ?? "project_images"
  const { data: blob, error: dlErr } = await service.storage.from(sourceBucket).download(src.storage_path)
  if (dlErr || !blob) return { ok: false, status: 400, stage: "source_download", reason: dlErr?.message ?? "Failed to download source" }

  let rendered: { buffer: Buffer; format: "jpeg" | "png" | "webp"; width: number; height: number }
  try {
    rendered = await applyFilterToBuffer({
      input: Buffer.from(await blob.arrayBuffer()),
      format: src.format,
      filterType,
      params,
    })
  } catch (e) {
    return { ok: false, status: 400, stage: "filter_process", reason: e instanceof Error ? e.message : "Filter processing failed" }
  }

  const imageId = crypto.randomUUID()
  const objectPath = `projects/${projectId}/images/${imageId}`
  const contentType = rendered.format === "jpeg" ? "image/jpeg" : rendered.format === "webp" ? "image/webp" : "image/png"
  const { error: uploadErr } = await service.storage.from("project_images").upload(objectPath, rendered.buffer, {
    upsert: false,
    contentType,
  })
  if (uploadErr) return { ok: false, status: 400, stage: "storage_upload", reason: uploadErr.message, code: (uploadErr as { code?: string }).code }

  const { error: insertErr } = await supabase.from("project_images").insert({
    id: imageId,
    project_id: projectId,
    role: "asset",
    name: `${src.name} (${filterType})`,
    format: rendered.format,
    width_px: rendered.width,
    height_px: rendered.height,
    storage_bucket: "project_images",
    storage_path: objectPath,
    file_size_bytes: rendered.buffer.byteLength,
    is_active: false,
    source_image_id: sourceImageId,
    crop_rect_px: null,
  })
  if (insertErr) {
    await service.storage.from("project_images").remove([objectPath])
    return { ok: false, status: 400, stage: "db_insert", reason: insertErr.message, code: (insertErr as { code?: string }).code }
  }

  return {
    ok: true,
    imageId,
    widthPx: rendered.width,
    heightPx: rendered.height,
    storagePath: objectPath,
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
    .select("id,role,storage_bucket,storage_path")
    .in("id", ids)
    .is("deleted_at", null)
  const deletable = (rows ?? []).filter((r) => r.role !== "master")
  if (!deletable.length) return
  for (const row of deletable) {
    if (row.storage_path) {
      await service.storage.from(row.storage_bucket ?? "project_images").remove([row.storage_path])
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
    .select("id,input_image_id,output_image_id,filter_type,filter_params,stack_order,created_at")
    .eq("project_id", projectId)
    .order("stack_order", { ascending: true })
  if (error) return { ok: false, status: 400, stage: "filter_lookup", reason: error.message, code: (error as { code?: string }).code }
  const items: FilterStackItem[] = (data ?? []).map((row) => ({
    id: String(row.id),
    input_image_id: String(row.input_image_id),
    output_image_id: String(row.output_image_id),
    filter_type: parseFilterType(row.filter_type) ?? "grayscale",
    filter_params: (row.filter_params as Record<string, unknown> | null) ?? {},
    stack_order: Number(row.stack_order),
    created_at: String(row.created_at),
  }))
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
  const params = normalizeFilterParams(filterType, args.filterParams)

  const { data: active, error: activeErr } = await supabase
    .from("project_images")
    .select("id,is_locked")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle()
  if (activeErr) return { ok: false, status: 400, stage: "active_lookup", reason: activeErr.message, code: (activeErr as { code?: string }).code }
  if (!active?.id) return { ok: false, status: 404, stage: "active_lookup", reason: "No active image found" }
  if (active.is_locked) return { ok: false, status: 409, stage: "lock_conflict", reason: "Active image is locked", code: "image_locked" }

  const created = await createDerivedImageFromSource({
    supabase,
    projectId,
    sourceImageId: String(active.id),
    filterType,
    params,
  })
  if (!created.ok) return created

  const { data: maxRow, error: maxErr } = await supabase
    .from("project_image_filters")
    .select("stack_order")
    .eq("project_id", projectId)
    .order("stack_order", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxErr) {
    await removeImageRowsAndStorage({ supabase, imageIds: [created.imageId] })
    return { ok: false, status: 400, stage: "db_insert", reason: maxErr.message, code: (maxErr as { code?: string }).code }
  }
  const nextOrder = Number(maxRow?.stack_order ?? 0) + 1
  const { data: inserted, error: filterErr } = await supabase
    .from("project_image_filters")
    .insert({
      project_id: projectId,
      input_image_id: String(active.id),
      output_image_id: created.imageId,
      filter_type: filterType,
      filter_params: params,
      stack_order: nextOrder,
    })
    .select("id,input_image_id,output_image_id,filter_type,filter_params,stack_order,created_at")
    .single()
  if (filterErr) {
    await removeImageRowsAndStorage({ supabase, imageIds: [created.imageId] })
    return { ok: false, status: 400, stage: "db_insert", reason: filterErr.message, code: (filterErr as { code?: string }).code }
  }

  const activation = await activateMasterWithState({
    supabase,
    projectId,
    imageId: created.imageId,
    widthPx: created.widthPx,
    heightPx: created.heightPx,
  })
  if (!activation.ok) {
    await supabase.from("project_image_filters").delete().eq("id", inserted.id)
    await removeImageRowsAndStorage({ supabase, imageIds: [created.imageId] })
    return { ok: false, status: activation.status, stage: activation.stage, reason: activation.reason, code: activation.code }
  }

  return {
    ok: true,
    item: {
      id: String(inserted.id),
      input_image_id: String(inserted.input_image_id),
      output_image_id: String(inserted.output_image_id),
      filter_type: parseFilterType(inserted.filter_type) ?? "grayscale",
      filter_params: (inserted.filter_params as Record<string, unknown> | null) ?? {},
      stack_order: Number(inserted.stack_order),
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

  // Rewire existing filter rows to the rebuilt outputs.
  for (let i = 0; i < after.length; i++) {
    const f = after[i]
    const prevImageId = i === 0 ? (idx > 0 ? filters[idx - 1].output_image_id : target.input_image_id) : newArtifacts[i - 1].imageId
    const nextImageId = newArtifacts[i].imageId
    const { error: updErr } = await supabase
      .from("project_image_filters")
      .update({
        input_image_id: prevImageId,
        output_image_id: nextImageId,
      })
      .eq("id", f.id)
      .eq("project_id", projectId)
    if (updErr) {
      await removeImageRowsAndStorage({ supabase, imageIds: newArtifacts.map((x) => x.imageId) })
      return { ok: false, status: 400, stage: "rebuild", reason: updErr.message, code: (updErr as { code?: string }).code }
    }
  }

  const { error: delFilterErr } = await supabase
    .from("project_image_filters")
    .delete()
    .eq("id", target.id)
    .eq("project_id", projectId)
  if (delFilterErr) {
    await removeImageRowsAndStorage({ supabase, imageIds: newArtifacts.map((x) => x.imageId) })
    return { ok: false, status: 400, stage: "rebuild", reason: delFilterErr.message, code: (delFilterErr as { code?: string }).code }
  }

  const { error: reorderErr } = await supabase.rpc("reorder_project_image_filters", {
    p_project_id: projectId,
  })
  if (reorderErr) {
    // fallback in case RPC does not exist yet
    const fresh = await listProjectImageFilters({ supabase, projectId })
    if (!fresh.ok) return fresh
    for (let i = 0; i < fresh.items.length; i++) {
      const { error } = await supabase.from("project_image_filters").update({ stack_order: i + 1 }).eq("id", fresh.items[i].id)
      if (error) return { ok: false, status: 400, stage: "rebuild", reason: error.message, code: (error as { code?: string }).code }
    }
  }

  const activeImageId = after.length > 0 ? newArtifacts[newArtifacts.length - 1].imageId : currentImageId
  const { data: activeRow, error: activeRowErr } = await supabase
    .from("project_images")
    .select("width_px,height_px")
    .eq("project_id", projectId)
    .eq("id", activeImageId)
    .is("deleted_at", null)
    .maybeSingle()
  if (activeRowErr || !activeRow) {
    return { ok: false, status: 400, stage: "active_lookup", reason: activeRowErr?.message ?? "Active image row missing" }
  }

  const activation = await activateMasterWithState({
    supabase,
    projectId,
    imageId: activeImageId,
    widthPx: Number(activeRow.width_px ?? 1),
    heightPx: Number(activeRow.height_px ?? 1),
  })
  if (!activation.ok) return { ok: false, status: activation.status, stage: activation.stage, reason: activation.reason, code: activation.code }

  await removeImageRowsAndStorage({ supabase, imageIds: oldOutputIdsToDelete })

  return { ok: true, active_image_id: activeImageId }
}

