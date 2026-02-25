/**
 * API route: master image metadata and signed URL.
 *
 * Responsibilities:
 * - Return active image metadata and a short-lived signed URL for download.
 * - Support deletion of the active master image and all transitively derived images.
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, jsonError, requireUser } from "@/lib/api/route-guards"

export const dynamic = "force-dynamic"

// Best-effort in-memory cache to reduce Storage signed URL churn.
const signedUrlCache = new Map<string, { url: string; expiresAtMs: number }>()
const SIGNED_URL_CACHE_MAX_ENTRIES = 500
const SIGNED_URL_TTL_S = 60 * 10
const SIGNED_URL_RENEW_BUFFER_MS = 60_000

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })
  }
  const supabase = await createSupabaseServerClient()

  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  // Explicit access check for clearer staged errors (RLS still enforces).
  const { data: projectRow, error: projectErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle()
  if (projectErr) {
    return jsonError("Failed to verify project access", 400, { stage: "project_access" })
  }
  if (!projectRow?.id) {
    return jsonError("Forbidden (project not accessible)", 403, { stage: "rls_denied", where: "project_access" })
  }

  const { data: img, error: imgErr } = await supabase
    .from("project_images")
    .select("id,storage_path,storage_bucket,name,format,width_px,height_px,dpi,file_size_bytes,is_active")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle()

  if (imgErr) {
    return jsonError(imgErr.message, 400, { stage: "image_query" })
  }

  if (!img?.storage_path) {
    return NextResponse.json({ exists: false })
  }

  const { data: restoreBase, error: restoreBaseErr } = await supabase
    .from("project_images")
    .select("id,width_px,height_px")
    .eq("project_id", projectId)
    .eq("role", "master")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (restoreBaseErr) {
    return jsonError(restoreBaseErr.message, 400, { stage: "restore_base_query" })
  }

  const restoreBasePayload =
    restoreBase && Number(restoreBase.width_px) > 0 && Number(restoreBase.height_px) > 0
      ? {
          id: String(restoreBase.id),
          width_px: Number(restoreBase.width_px),
          height_px: Number(restoreBase.height_px),
        }
      : null
  const dpiRaw = Number(img.dpi)
  const dpi = Number.isFinite(dpiRaw) && dpiRaw > 0 ? Math.round(dpiRaw) : null

  const now = Date.now()
  const bucket = img.storage_bucket ?? "project_images"
  const cacheKey = `${u.user.id}:${bucket}:${img.storage_path}`
  const cached = signedUrlCache.get(cacheKey)
  if (cached && cached.expiresAtMs - SIGNED_URL_RENEW_BUFFER_MS > now) {
    signedUrlCache.delete(cacheKey)
    signedUrlCache.set(cacheKey, cached)
    return NextResponse.json({
      exists: true,
      id: img.id,
      signedUrl: cached.url,
      storage_path: img.storage_path,
      name: img.name,
      format: img.format,
      width_px: img.width_px,
      height_px: img.height_px,
      dpi,
      file_size_bytes: img.file_size_bytes,
      restore_base: restoreBasePayload,
    })
  }

  const { data: signed, error: signedErr } = await supabase.storage.from(bucket).createSignedUrl(img.storage_path, SIGNED_URL_TTL_S)

  if (signedErr || !signed?.signedUrl) {
    return jsonError(signedErr?.message ?? "Failed to create signed URL", 400, { stage: "storage_policy", op: "createSignedUrl" })
  }

  signedUrlCache.set(cacheKey, { url: signed.signedUrl, expiresAtMs: now + SIGNED_URL_TTL_S * 1000 })
  if (signedUrlCache.size > SIGNED_URL_CACHE_MAX_ENTRIES) {
    const firstKey = signedUrlCache.keys().next().value as string | undefined
    if (firstKey) signedUrlCache.delete(firstKey)
  }

  return NextResponse.json({
    exists: true,
    id: img.id,
    signedUrl: signed.signedUrl,
    storage_path: img.storage_path,
    name: img.name,
    format: img.format,
    width_px: img.width_px,
    height_px: img.height_px,
    dpi,
    file_size_bytes: img.file_size_bytes,
    restore_base: restoreBasePayload,
  })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })
  }
  const supabase = await createSupabaseServerClient()

  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  // Explicit access check for clearer staged errors (RLS still enforces).
  const { data: projectRow, error: projectErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle()
  if (projectErr) {
    return jsonError("Failed to verify project access", 400, { stage: "project_access" })
  }
  if (!projectRow?.id) {
    return jsonError("Forbidden (project not accessible)", 403, { stage: "rls_denied", where: "project_access" })
  }

  // Fetch the active image to delete
  const { data: imageToDelete, error: fetchErr } = await supabase
    .from("project_images")
    .select("id,storage_path,storage_bucket,is_active")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle()

  if (fetchErr) {
    return jsonError("Failed to fetch image", 400, { stage: "fetch_image" })
  }
  if (!imageToDelete) {
    return jsonError("Image not found", 404, { stage: "not_found" })
  }

  const imageId = imageToDelete.id

  // Fetch ALL images in project to find transitive dependencies
  const { data: allImages } = await supabase
    .from("project_images")
    .select("id,storage_path,storage_bucket,source_image_id")
    .eq("project_id", projectId)
    .is("deleted_at", null)

  // Build transitive dependency tree (all images that depend on imageId, directly or transitively)
  const transitivelyDerived = new Set<string>()
  const toProcess = [imageId]
  
  while (toProcess.length > 0) {
    const currentId = toProcess.pop()!
    const children = (allImages ?? []).filter((img) => img.source_image_id === currentId)
    for (const child of children) {
      if (!transitivelyDerived.has(child.id)) {
        transitivelyDerived.add(child.id)
        toProcess.push(child.id)
      }
    }
  }

  const wasActive = imageToDelete.is_active

  // Delete the master image (cascade will delete all derived images via FK)
  const { error: deleteErr } = await supabase
    .from("project_images")
    .delete()
    .eq("id", imageId)
    .eq("project_id", projectId)

  if (deleteErr) {
    return jsonError("Failed to delete image", 400, { stage: "db_delete", error: deleteErr.message })
  }

  // Clean up storage for master
  const storagePaths: string[] = []
  if (imageToDelete.storage_path) {
    storagePaths.push(imageToDelete.storage_path)
  }

  // Clean up storage for all transitively derived images
  if (allImages) {
    for (const img of allImages) {
      if (transitivelyDerived.has(img.id) && img.storage_path) {
        storagePaths.push(img.storage_path)
      }
    }
  }

  if (storagePaths.length > 0) {
    const bucket = imageToDelete.storage_bucket ?? "project_images"
    await supabase.storage.from(bucket).remove(storagePaths)
  }

  // If we deleted the active image, promote the latest remaining master
  if (wasActive) {
    const { data: remainingImages } = await supabase
      .from("project_images")
      .select("id")
      .eq("project_id", projectId)
      .eq("role", "master")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)

    if (remainingImages && remainingImages.length > 0) {
      await supabase
        .from("project_images")
        .update({ is_active: true })
        .eq("id", remainingImages[0].id)
    }
  }

  return NextResponse.json({ ok: true })
}
