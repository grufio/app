import crypto from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { resolveEditorTargetImageRows } from "@/lib/supabase/project-images"
import { copyImageTransform } from "@/services/editor/server/copy-image-transform"
import { resetProjectFilterChain } from "@/services/editor/server/filter-chain-reset"

type FailStage =
  | "active_lookup"
  | "no_active_image"
  | "working_copy_exists"
  | "filter_rows_query"
  | "filter_output_query"
  | "filter_output_missing"
  | "filter_tip_missing"
  | "storage_download"
  | "storage_upload"
  | "db_insert"
  | "soft_delete"
  | "transform_sync"
  | "chain_invalid"

type Failure = {
  ok: false
  status: number
  stage: FailStage
  reason: string
  code?: string
}

type Success = {
  ok: true
  id: string
  storagePath: string
  widthPx: number
  heightPx: number
  signedUrl: string
  sourceImageId: string | null
  name: string
}

export type FilterWorkingCopyResult = Success | Failure

export type FilterPanelStackItem = {
  id: string
  name: string
  filterType: "pixelate" | "lineart" | "numerate" | "unknown"
  source_image_id: string | null
}

export type FilterPanelDataResult =
  | {
      ok: true
      display: {
        id: string
        storagePath: string
        widthPx: number
        heightPx: number
        signedUrl: string
        sourceImageId: string | null
        name: string
        isFilterResult: boolean
      }
      stack: FilterPanelStackItem[]
    }
  | Failure

function parseFilterType(value: unknown): FilterPanelStackItem["filterType"] {
  const type = String(value ?? "").toLowerCase()
  if (type === "pixelate") return "pixelate"
  if (type === "lineart" || type === "line art") return "lineart"
  if (type === "numerate") return "numerate"
  return "unknown"
}

async function softDeleteCopies(
  supabase: SupabaseClient<Database>,
  ids: string[]
): Promise<{ ok: true } | { ok: false; reason: string; code?: string }> {
  if (!ids.length) return { ok: true }
  const { error } = await supabase
    .from("project_images")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids)
  if (error) {
    return { ok: false, reason: error.message, code: error.code }
  }
  return { ok: true }
}

/**
 * Creates or retrieves a filter working copy from the active image.
 *
 * Logic:
 * 1. Find current editor target image (filter/working preferred, never master)
 * 2. Check if a working copy already exists (kind='filter_working_copy', source_image_id=activeImageId, name ends with '(filter working)')
 * 3. If exists and points to current active image, return existing copy with fresh signed URL
 * 4. If exists but points to old image, soft-delete it and create new copy
 * 5. If not exists, download active image from storage, upload as new copy, insert DB row
 */
export async function getOrCreateFilterWorkingCopy(args: {
  supabase: SupabaseClient<Database>
  projectId: string
}): Promise<FilterWorkingCopyResult> {
  const { supabase, projectId } = args

  // The filter chain base is always derived from the project's working_copy, never from a
  // filter output. Using the chain tip here would make every filter apply replace the base
  // and orphan the freshly inserted filter row.
  const lookup = await resolveEditorTargetImageRows(supabase, projectId)
  if (lookup.error) {
    return {
      ok: false,
      status: 400,
      stage: "active_lookup",
      reason: lookup.error.reason,
      code: lookup.error.code,
    }
  }
  const activeImage = lookup.preferredWorking
  if (!activeImage) {
    return {
      ok: false,
      status: 404,
      stage: "no_active_image",
      reason: "Active image not found",
    }
  }
  if (
    !activeImage.name ||
    !activeImage.storage_path ||
    !activeImage.format ||
    !(Number(activeImage.width_px ?? 0) > 0) ||
    !(Number(activeImage.height_px ?? 0) > 0)
  ) {
    return {
      ok: false,
      status: 409,
      stage: "active_lookup",
      reason: "Active image is missing required fields",
    }
  }
  const activeWidthPx = Number(activeImage.width_px)
  const activeHeightPx = Number(activeImage.height_px)
  const activeName = String(activeImage.name)
  const activeFormat = String(activeImage.format)
  const activeFileSizeBytes = Number(activeImage.file_size_bytes ?? 0)

  // Load all candidate working copies and pick deterministically.
  const { data: existingCopies, error: existingErr } = await supabase
    .from("project_images")
    .select("id,storage_bucket,storage_path,width_px,height_px,source_image_id,name,updated_at,created_at,kind")
    .eq("project_id", projectId)
    .eq("role", "asset")
    .like("name", "%(filter working)")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20)

  if (existingErr) {
    return {
      ok: false,
      status: 400,
      stage: "working_copy_exists",
      reason: existingErr.message,
      code: existingErr.code,
    }
  }

  const workingCopyName = `${activeName} (filter working)`
  const reusableCopy = (existingCopies ?? []).find(
    (copy) => copy.source_image_id === activeImage.id && copy.name === workingCopyName
  )

  // If a reusable copy exists, keep the newest matching one and tombstone the rest.
  if (reusableCopy) {
    const obsoleteIds = (existingCopies ?? [])
      .filter((copy) => copy.id !== reusableCopy.id)
      .map((copy) => copy.id)
    if (obsoleteIds.length > 0) {
      const reset = await resetProjectFilterChain({ supabase, projectId })
      if (!reset.ok) {
        return { ok: false, status: 500, stage: "soft_delete", reason: reset.reason, code: reset.code }
      }
    }
    const softDelete = await softDeleteCopies(supabase, obsoleteIds)
    if (!softDelete.ok) {
      return {
        ok: false,
        status: 500,
        stage: "soft_delete",
        reason: softDelete.reason,
        code: softDelete.code,
      }
    }

    // Return existing copy with fresh signed URL
    const { data: signedData } = await supabase.storage
      .from(String(reusableCopy.storage_bucket ?? "project_images"))
      .createSignedUrl(String(reusableCopy.storage_path), 3600)

    const transformSync = await copyImageTransform({
      supabase,
      projectId,
      sourceImageId: activeImage.id,
      targetImageId: reusableCopy.id,
      sourceWidth: activeWidthPx,
      sourceHeight: activeHeightPx,
      targetWidth: reusableCopy.width_px,
      targetHeight: reusableCopy.height_px,
    })
    if (!transformSync.ok) {
      return {
        ok: false,
        status: 500,
        stage: "transform_sync",
        reason: transformSync.reason,
      }
    }

    return {
      ok: true,
      id: reusableCopy.id,
      storagePath: reusableCopy.storage_path,
      widthPx: reusableCopy.width_px,
      heightPx: reusableCopy.height_px,
      signedUrl: signedData?.signedUrl ?? "",
      sourceImageId: activeImage.id,
      name: activeName,
    }
  }

  // No reusable copy: tombstone all historical candidates before creating a new one.
  // Filter rows reference the old copies as input/output, so we must clear them too.
  const reset = await resetProjectFilterChain({ supabase, projectId })
  if (!reset.ok) {
    return { ok: false, status: 500, stage: "soft_delete", reason: reset.reason, code: reset.code }
  }
  const softDelete = await softDeleteCopies(
    supabase,
    (existingCopies ?? []).map((copy) => copy.id)
  )
  if (!softDelete.ok) {
    return {
      ok: false,
      status: 500,
      stage: "soft_delete",
      reason: softDelete.reason,
      code: softDelete.code,
    }
  }

  // Download active image from storage
  const { data: srcBlob, error: downloadErr } = await supabase.storage
    .from(String(activeImage.storage_bucket ?? "project_images"))
    .download(String(activeImage.storage_path))

  if (downloadErr || !srcBlob) {
    return {
      ok: false,
      status: 500,
      stage: "storage_download",
      reason: "Failed to download active image",
    }
  }

  const srcBuffer = Buffer.from(await srcBlob.arrayBuffer())

  // Create new working copy
  const workingCopyId = crypto.randomUUID()
  const objectPath = `projects/${projectId}/images/${workingCopyId}`

  const contentTypeMap: Record<string, string> = {
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  }
  const contentType = contentTypeMap[activeFormat.toLowerCase()] ?? "application/octet-stream"

  const { error: uploadErr } = await supabase.storage.from("project_images").upload(objectPath, srcBuffer, {
    contentType,
    upsert: false,
  })

  if (uploadErr) {
    return {
      ok: false,
      status: 500,
      stage: "storage_upload",
      reason: "Failed to upload working copy",
    }
  }

  // Insert DB row
  const { error: insertErr } = await supabase.from("project_images").insert({
    id: workingCopyId,
    project_id: projectId,
    kind: "filter_working_copy",
    name: workingCopyName,
    format: activeFormat,
    width_px: activeWidthPx,
    height_px: activeHeightPx,
    storage_bucket: "project_images",
    storage_path: objectPath,
    file_size_bytes: activeFileSizeBytes,
    is_active: false,
    source_image_id: activeImage.id,
  })

  if (insertErr) {
    await supabase.storage.from("project_images").remove([objectPath])
    return {
      ok: false,
      status: 400,
      stage: "db_insert",
      reason: insertErr.message,
      code: insertErr.code,
    }
  }

  const transformSync = await copyImageTransform({
    supabase,
    projectId,
    sourceImageId: activeImage.id,
    targetImageId: workingCopyId,
    sourceWidth: activeWidthPx,
    sourceHeight: activeHeightPx,
    targetWidth: activeWidthPx,
    targetHeight: activeHeightPx,
  })
  if (!transformSync.ok) {
    const { error: softDeleteErr } = await supabase
      .from("project_images")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", workingCopyId)
    await supabase.storage.from("project_images").remove([objectPath])
    const reason = softDeleteErr
      ? `${transformSync.reason}; failed to tombstone working copy: ${softDeleteErr.message}`
      : transformSync.reason
    return {
      ok: false,
      status: 500,
      stage: "transform_sync",
      reason,
    }
  }

  // Get signed URL for the new copy
  const { data: signedData } = await supabase.storage
    .from("project_images")
    .createSignedUrl(objectPath, 3600)

  return {
    ok: true,
    id: workingCopyId,
    storagePath: objectPath,
    widthPx: activeWidthPx,
    heightPx: activeHeightPx,
    signedUrl: signedData?.signedUrl ?? "",
    sourceImageId: activeImage.id,
    name: activeName,
  }
}

export async function getFilterPanelData(args: {
  supabase: SupabaseClient<Database>
  projectId: string
}): Promise<FilterPanelDataResult> {
  const { supabase, projectId } = args
  const working = await getOrCreateFilterWorkingCopy({ supabase, projectId })
  if (!working.ok) return working

  const { data: filterRows, error: filterErr } = await supabase
    .from("project_image_filters")
    .select("id,input_image_id,output_image_id,filter_type,stack_order")
    .eq("project_id", projectId)
    .order("stack_order", { ascending: true })

  if (filterErr) {
    return {
      ok: false,
      status: 400,
      stage: "filter_rows_query",
      reason: filterErr.message,
      code: filterErr.code,
    }
  }

  const displayFromWorking = {
    id: working.id,
    storagePath: working.storagePath,
    widthPx: working.widthPx,
    heightPx: working.heightPx,
    signedUrl: working.signedUrl,
    sourceImageId: working.sourceImageId,
    name: working.name,
    isFilterResult: false,
  }
  if (!(filterRows ?? []).length) {
    return {
      ok: true,
      display: displayFromWorking,
      stack: [],
    }
  }

  const chain: Array<{
    id: string
    input_image_id: string
    output_image_id: string
    filter_type: string
  }> = []
  let cursorImageId = working.id
  for (const row of filterRows ?? []) {
    const input = String(row.input_image_id ?? "")
    const output = String(row.output_image_id ?? "")
    if (!input || !output) continue
    if (input !== cursorImageId) continue
    chain.push({
      id: String(row.id),
      input_image_id: input,
      output_image_id: output,
      filter_type: String(row.filter_type ?? ""),
    })
    cursorImageId = output
  }

  if (!chain.length) {
    if ((filterRows ?? []).length > 0) {
      console.warn("[filter-working-copy] orphaned chain detected, auto-resetting", {
        projectId,
        workingCopyId: working.id,
        orphanCount: filterRows?.length ?? 0,
      })
      const reset = await resetProjectFilterChain({ supabase, projectId })
      if (!reset.ok) {
        return { ok: false, status: 500, stage: "chain_invalid", reason: reset.reason, code: reset.code }
      }
    }
    return {
      ok: true,
      display: displayFromWorking,
      stack: [],
    }
  }

  const chainRowIds = new Set(chain.map((node) => node.id))
  const hasDisconnectedRows = (filterRows ?? []).some((row) => !chainRowIds.has(String(row.id)))
  if (hasDisconnectedRows) {
    console.warn("[filter-working-copy] disconnected chain segments detected, auto-resetting", {
      projectId,
      workingCopyId: working.id,
      orphanCount: (filterRows ?? []).length - chain.length,
    })
    const reset = await resetProjectFilterChain({ supabase, projectId })
    if (!reset.ok) {
      return { ok: false, status: 500, stage: "chain_invalid", reason: reset.reason, code: reset.code }
    }
    return {
      ok: true,
      display: displayFromWorking,
      stack: [],
    }
  }

  const outputImageIds = chain.map((row) => row.output_image_id)
  const { data: images, error } = await supabase
    .from("project_images")
    .select("id,name,storage_bucket,storage_path,width_px,height_px,source_image_id")
    .eq("project_id", projectId)
    .eq("role", "asset")
    .in("id", outputImageIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (error) {
    return {
      ok: false,
      status: 400,
      stage: "filter_output_query",
      reason: error.message,
      code: error.code,
    }
  }

  const imageById = new Map((images ?? []).map((row) => [row.id, row]))
  const stack: FilterPanelStackItem[] = []
  for (const node of chain) {
    const image = imageById.get(node.output_image_id)
    if (!image) {
      return {
        ok: false,
        status: 409,
        stage: "filter_output_missing",
        reason: "Filter chain references a missing output image",
      }
    }
    stack.push({
      id: node.id,
      name: image.name,
      filterType: parseFilterType(node.filter_type),
      source_image_id: node.input_image_id,
    })
  }

  const tipId = chain[chain.length - 1].output_image_id
  const tipImage = imageById.get(tipId)
  if (!tipImage) {
    return {
      ok: false,
      status: 409,
      stage: "filter_tip_missing",
      reason: "Filter chain tip is missing",
    }
  }
  const { data: signedData } = await supabase.storage
    .from(String(tipImage.storage_bucket ?? "project_images"))
    .createSignedUrl(String(tipImage.storage_path), 3600)

  return {
    ok: true,
    display: {
      id: tipImage.id,
      storagePath: tipImage.storage_path,
      widthPx: tipImage.width_px,
      heightPx: tipImage.height_px,
      signedUrl: signedData?.signedUrl ?? "",
      sourceImageId: tipImage.source_image_id,
      name: tipImage.name,
      isFilterResult: true,
    },
    stack,
  }
}
