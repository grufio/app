import crypto from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { resolveEditorTargetImageRows } from "@/lib/supabase/project-images"
import { SIGNED_URL_TTL } from "@/lib/storage/signed-url-ttl"
import { resetProjectFilterChain } from "@/services/editor/server/filter-chain-reset"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"

import { softDeleteCopies } from "./soft-delete-copies"
import type { FilterWorkingCopyResult } from "./types"

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
    .eq("kind", "filter_working_copy")
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
    (copy) => copy.source_image_id === activeImage.id && copy.name === workingCopyName,
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

    // Return existing copy with fresh signed URL. State doesn't need
    // to be copied to the reused copy's id — project_image_state is
    // anchored at master.id and the editor resolves there regardless
    // of which filter surface is rendered.
    const { data: signedData } = await supabase.storage
      .from(String(reusableCopy.storage_bucket ?? PROJECT_IMAGES_BUCKET))
      .createSignedUrl(String(reusableCopy.storage_path), SIGNED_URL_TTL.filterWorkingCopy)

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
    (existingCopies ?? []).map((copy) => copy.id),
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
    .from(String(activeImage.storage_bucket ?? PROJECT_IMAGES_BUCKET))
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

  const { error: uploadErr } = await supabase.storage.from(PROJECT_IMAGES_BUCKET).upload(objectPath, srcBuffer, {
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
    storage_bucket: PROJECT_IMAGES_BUCKET,
    storage_path: objectPath,
    file_size_bytes: activeFileSizeBytes,
    is_active: false,
    source_image_id: activeImage.id,
  })

  if (insertErr) {
    await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove([objectPath])
    return {
      ok: false,
      status: 400,
      stage: "db_insert",
      reason: insertErr.message,
      code: insertErr.code,
    }
  }

  // State doesn't need to be copied — anchored at master.id; see
  // route handler `app/api/projects/[projectId]/image-state/route.ts`.

  // Get signed URL for the new copy
  const { data: signedData } = await supabase.storage
    .from("project_images")
    .createSignedUrl(objectPath, SIGNED_URL_TTL.filterWorkingCopy)

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
