import type { SupabaseClient } from "@supabase/supabase-js"

import { IMAGE_KIND, resolveImageKind } from "@/lib/editor/image-kind"
import type { Database } from "@/lib/supabase/database.types"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { getEditorTargetImageRow } from "@/lib/supabase/project-images"
import { activateProjectImage } from "@/services/editor/server/activate-project-image"
import { appendProjectImageFilter } from "@/services/editor/server/filter-chain"
import { lineArtImageAndActivate } from "@/services/editor/server/filters/lineart"
import { numerateImageAndActivate } from "@/services/editor/server/filters/numerate"
import { pixelateImageAndActivate } from "@/services/editor/server/filters/pixelate"

export type SupportedFilterType = "pixelate" | "lineart" | "numerate"

export type FilterOpFailure = {
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
    | "numerate_process"
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
  if (v === "pixelate" || v === "lineart" || v === "numerate") return v
  return null
}

function normalizeFilterParams(filterType: SupportedFilterType, params: unknown): Record<string, unknown> {
  const input = (params as Record<string, unknown> | null | undefined) ?? {}
  if (filterType === "pixelate") {
    const superpixelWidthRaw = Number(input.superpixel_width ?? 10)
    const superpixelHeightRaw = Number(input.superpixel_height ?? 10)
    const numColorsRaw = Number(input.num_colors ?? 16)
    const colorMode = String(input.color_mode ?? "rgb").toLowerCase() === "grayscale" ? "grayscale" : "rgb"
    return {
      superpixel_width: Number.isFinite(superpixelWidthRaw) ? Math.max(1, Math.round(superpixelWidthRaw)) : 10,
      superpixel_height: Number.isFinite(superpixelHeightRaw) ? Math.max(1, Math.round(superpixelHeightRaw)) : 10,
      num_colors: Number.isFinite(numColorsRaw) ? Math.min(256, Math.max(2, Math.round(numColorsRaw))) : 16,
      color_mode: colorMode,
    }
  }
  if (filterType === "lineart") {
    const threshold1Raw = Number(input.threshold1 ?? 100)
    const threshold2Raw = Number(input.threshold2 ?? 200)
    const lineThicknessRaw = Number(input.line_thickness ?? 2)
    const blurAmountRaw = Number(input.blur_amount ?? 3)
    const minContourAreaRaw = Number(input.min_contour_area ?? 200)
    const smoothnessRaw = Number(input.smoothness ?? 0.005)
    return {
      threshold1: Number.isFinite(threshold1Raw) ? Math.round(threshold1Raw) : 100,
      threshold2: Number.isFinite(threshold2Raw) ? Math.round(threshold2Raw) : 200,
      line_thickness: Number.isFinite(lineThicknessRaw) ? Math.max(1, Math.round(lineThicknessRaw)) : 2,
      blur_amount: Number.isFinite(blurAmountRaw) ? Math.max(0, Math.round(blurAmountRaw)) : 3,
      min_contour_area: Number.isFinite(minContourAreaRaw) ? Math.max(0, Math.round(minContourAreaRaw)) : 200,
      invert: Boolean(input.invert),
      smoothness: Number.isFinite(smoothnessRaw) ? smoothnessRaw : 0.005,
    }
  }
  if (filterType === "numerate") {
    const superpixelWidthRaw = Number(input.superpixel_width ?? 10)
    const superpixelHeightRaw = Number(input.superpixel_height ?? 10)
    const strokeWidthRaw = Number(input.stroke_width ?? 1)
    return {
      superpixel_width: Number.isFinite(superpixelWidthRaw) ? Math.max(1, Math.round(superpixelWidthRaw)) : 10,
      superpixel_height: Number.isFinite(superpixelHeightRaw) ? Math.max(1, Math.round(superpixelHeightRaw)) : 10,
      stroke_width: Number.isFinite(strokeWidthRaw) ? Math.max(1, Math.round(strokeWidthRaw)) : 1,
      show_colors: Boolean(input.show_colors),
    }
  }
  return {}
}

async function createDerivedImageFromSource(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  sourceImageId: string
  filterType: SupportedFilterType
  params: Record<string, unknown>
}): Promise<{ ok: true; imageId: string; widthPx: number; heightPx: number; storagePath: string } | FilterOpFailure> {
  const { supabase, projectId, sourceImageId, filterType, params } = args
  if (filterType === "pixelate") {
    const result = await pixelateImageAndActivate({
      supabase,
      projectId,
      sourceImageId,
      params: {
        superpixelWidth: Number(params.superpixel_width),
        superpixelHeight: Number(params.superpixel_height),
        colorMode: String(params.color_mode ?? "rgb") === "grayscale" ? "grayscale" : "rgb",
        numColors: Number(params.num_colors),
      },
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
  if (filterType === "lineart") {
    const result = await lineArtImageAndActivate({
      supabase,
      projectId,
      sourceImageId,
      params: {
        threshold1: Number(params.threshold1),
        threshold2: Number(params.threshold2),
        lineThickness: Number(params.line_thickness),
        blurAmount: Number(params.blur_amount),
        minContourArea: Number(params.min_contour_area),
        invert: Boolean(params.invert),
        smoothness: Number(params.smoothness),
      },
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
  const result = await numerateImageAndActivate({
    supabase,
    projectId,
    sourceImageId,
    params: {
      superpixelWidth: Number(params.superpixel_width),
      superpixelHeight: Number(params.superpixel_height),
      strokeWidth: Number(params.stroke_width),
      showColors: Boolean(params.show_colors),
    },
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

  const activation = await activateProjectImage({
    supabase,
    projectId,
    imageId: created.imageId,
    widthPx: created.widthPx,
    heightPx: created.heightPx,
    imageDpi: sourceImageDpi,
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
    .select("width_px,height_px,dpi")
    .eq("project_id", projectId)
    .eq("id", activeImageId)
    .is("deleted_at", null)
    .maybeSingle()
  if (activeRowErr || !activeRow) {
    return { ok: false, status: 400, stage: "active_lookup", reason: activeRowErr?.message ?? "Active image row missing" }
  }

  const activation = await activateProjectImage({
    supabase,
    projectId,
    imageId: activeImageId,
    widthPx: Number(activeRow.width_px ?? 1),
    heightPx: Number(activeRow.height_px ?? 1),
    imageDpi: Number(activeRow.dpi ?? 72),
  })
  if (!activation.ok) return { ok: false, status: activation.status, stage: activation.stage, reason: activation.reason, code: activation.code }

  await removeImageRowsAndStorage({ supabase, imageIds: oldOutputIdsToDelete })

  return { ok: true, active_image_id: activeImageId }
}

