import crypto from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

type FailStage = "active_lookup" | "working_copy_exists" | "storage_download" | "storage_upload" | "db_insert"

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

  // Check if working copy already exists for this project
  // There should only be one working copy per project (role='asset', name ends with '(filter working)')
  const { data: existingCopy, error: existingErr } = await supabase
    .from("project_images")
    .select("id,storage_bucket,storage_path,width_px,height_px,source_image_id,name")
    .eq("project_id", projectId)
    .eq("role", "asset")
    .like("name", "%(filter working)")
    .is("deleted_at", null)
    .maybeSingle()

  const workingCopyName = `${activeImage.name} (filter working)`

  // If working copy exists and points to the current active image, return it
  if (existingCopy && existingCopy.source_image_id === activeImage.id && existingCopy.name === workingCopyName) {
    // Return existing copy with fresh signed URL
    const { data: signedData } = await supabase.storage
      .from(String(existingCopy.storage_bucket ?? "project_images"))
      .createSignedUrl(String(existingCopy.storage_path), 3600)

    return {
      ok: true,
      id: existingCopy.id,
      storagePath: existingCopy.storage_path,
      widthPx: existingCopy.width_px,
      heightPx: existingCopy.height_px,
      signedUrl: signedData?.signedUrl ?? "",
      sourceImageId: activeImage.source_image_id,
      name: activeImage.name,
    }
  }

  // If working copy exists but is outdated (wrong source or wrong name), soft-delete it
  if (existingCopy) {
    await supabase
      .from("project_images")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", existingCopy.id)
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
    sourceImageId: activeImage.source_image_id,
    name: activeImage.name,
  }
}
