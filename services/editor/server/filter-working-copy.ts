import crypto from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { copyImageTransform } from "@/services/editor/server/copy-image-transform"

type FailStage = "active_lookup" | "working_copy_exists" | "storage_download" | "storage_upload" | "db_insert" | "transform_sync"

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
): Promise<void> {
  if (!ids.length) return
  await supabase
    .from("project_images")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids)
}

/**
 * Creates or retrieves a filter working copy from the active image.
 *
 * Logic:
 * 1. Find active image (is_active=true, any role)
 * 2. Check if a working copy already exists (role='asset', source_image_id=activeImageId, name ends with '(filter working)')
 * 3. If exists and points to current active image, return existing copy with fresh signed URL
 * 4. If exists but points to old image, soft-delete it and create new copy
 * 5. If not exists, download active image from storage, upload as new copy, insert DB row
 */
export async function getOrCreateFilterWorkingCopy(args: {
  supabase: SupabaseClient<Database>
  projectId: string
}): Promise<FilterWorkingCopyResult> {
  const { supabase, projectId } = args

  // Find active image (any role)
  const { data: activeImage, error: activeErr } = await supabase
    .from("project_images")
    .select("id,name,storage_bucket,storage_path,format,width_px,height_px,file_size_bytes,source_image_id")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle()

  if (activeErr || !activeImage) {
    return {
      ok: false,
      status: 404,
      stage: "active_lookup",
      reason: "Active image not found",
      code: activeErr?.code,
    }
  }

  // Load all candidate working copies and pick deterministically.
  const { data: existingCopies, error: existingErr } = await supabase
    .from("project_images")
    .select("id,storage_bucket,storage_path,width_px,height_px,source_image_id,name,updated_at,created_at")
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

  const workingCopyName = `${activeImage.name} (filter working)`
  const reusableCopy = (existingCopies ?? []).find(
    (copy) => copy.source_image_id === activeImage.id && copy.name === workingCopyName
  )

  // If a reusable copy exists, keep the newest matching one and tombstone the rest.
  if (reusableCopy) {
    const obsoleteIds = (existingCopies ?? [])
      .filter((copy) => copy.id !== reusableCopy.id)
      .map((copy) => copy.id)
    await softDeleteCopies(supabase, obsoleteIds)

    // Return existing copy with fresh signed URL
    const { data: signedData } = await supabase.storage
      .from(String(reusableCopy.storage_bucket ?? "project_images"))
      .createSignedUrl(String(reusableCopy.storage_path), 3600)

    const transformSync = await copyImageTransform({
      supabase,
      projectId,
      sourceImageId: activeImage.id,
      targetImageId: reusableCopy.id,
      sourceWidth: activeImage.width_px,
      sourceHeight: activeImage.height_px,
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
      name: activeImage.name,
    }
  }

  // No reusable copy: tombstone all historical candidates before creating a new one.
  await softDeleteCopies(
    supabase,
    (existingCopies ?? []).map((copy) => copy.id)
  )

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
  const contentType = contentTypeMap[String(activeImage.format).toLowerCase()] ?? "application/octet-stream"

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
    role: "asset",
    name: workingCopyName,
    format: activeImage.format,
    width_px: activeImage.width_px,
    height_px: activeImage.height_px,
    storage_bucket: "project_images",
    storage_path: objectPath,
    file_size_bytes: activeImage.file_size_bytes,
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
    sourceWidth: activeImage.width_px,
    sourceHeight: activeImage.height_px,
    targetWidth: activeImage.width_px,
    targetHeight: activeImage.height_px,
  })
  if (!transformSync.ok) {
    await supabase.from("project_images").update({ deleted_at: new Date().toISOString() }).eq("id", workingCopyId)
    await supabase.storage.from("project_images").remove([objectPath])
    return {
      ok: false,
      status: 500,
      stage: "transform_sync",
      reason: transformSync.reason,
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
    widthPx: activeImage.width_px,
    heightPx: activeImage.height_px,
    signedUrl: signedData?.signedUrl ?? "",
    sourceImageId: activeImage.id,
    name: activeImage.name,
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
      stage: "working_copy_exists",
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
      stage: "working_copy_exists",
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
        stage: "working_copy_exists",
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
      stage: "working_copy_exists",
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
