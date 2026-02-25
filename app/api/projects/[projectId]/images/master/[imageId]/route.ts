/**
 * API route: delete a master image by id.
 *
 * Responsibilities:
 * - Delete DB record (cascade will auto-delete derived images via FK)
 * - Delete storage objects for the master and all transitively derived images
 * - If the active master was removed, promote the latest remaining master
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, jsonError, requireUser } from "@/lib/api/route-guards"

export const dynamic = "force-dynamic"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; imageId: string }> }
) {
  const { projectId, imageId } = await params
  if (!isUuid(String(projectId)) || !isUuid(String(imageId))) {
    return jsonError("Invalid params", 400, { stage: "validation", where: "params" })
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

  // Fetch the image to delete
  const { data: imageToDelete, error: fetchErr } = await supabase
    .from("project_images")
    .select("id,storage_path,storage_bucket,is_active")
    .eq("id", imageId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle()

  if (fetchErr) {
    return jsonError("Failed to fetch image", 400, { stage: "fetch_image" })
  }
  if (!imageToDelete) {
    return jsonError("Image not found", 404, { stage: "not_found" })
  }

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
