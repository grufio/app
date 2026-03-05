/**
 * API route: delete a non-master image by id.
 *
 * Responsibilities:
 * - Delete non-master DB record (cascade will auto-delete derived images via FK)
 * - Delete storage objects for the master and all transitively derived images
 * - If the active image was removed, promote the latest remaining master
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
    .select("id,storage_path,storage_bucket,is_active,role")
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
  if (imageToDelete.role === "master") {
    return jsonError("Master image is immutable. Use restore/replace flow.", 409, { stage: "master_immutable" })
  }

  const { data: targetsRaw, error: targetsErr } = await supabase.rpc("collect_project_image_delete_targets", {
    p_project_id: projectId,
    p_root_image_id: imageId,
  })
  if (targetsErr) {
    return jsonError("Failed to resolve transitive delete targets", 500, {
      stage: "delete_targets",
      error: targetsErr.message,
      code: (targetsErr as unknown as { code?: string })?.code,
    })
  }
  const deleteTargets = Array.isArray(targetsRaw)
    ? (targetsRaw as Array<{ id: string; storage_bucket: string | null; storage_path: string | null }>)
    : []

  const wasActive = imageToDelete.is_active

  // Delete non-master image (cascade deletes derived rows via FK)
  const { error: deleteErr, count } = await supabase
    .from("project_images")
    .delete({ count: "exact" })
    .eq("id", imageId)
    .eq("project_id", projectId)
    .neq("role", "master")

  if (deleteErr) {
    return jsonError("Failed to delete image", 500, { stage: "db_delete", error: deleteErr.message, code: deleteErr.code })
  }

  if (count === 0) {
    return jsonError("Image was not deleted (possibly already deleted or RLS blocked)", 400, { stage: "db_delete", code: "no_rows_affected" })
  }

  if (deleteTargets.length > 0) {
    const storageByBucket = new Map<string, string[]>()
    const defaultBucket = "project_images"
    for (const target of deleteTargets) {
      if (!target.storage_path) continue
      const bucket = target.storage_bucket ?? defaultBucket
      const existing = storageByBucket.get(bucket)
      if (existing) existing.push(target.storage_path)
      else storageByBucket.set(bucket, [target.storage_path])
    }
    for (const [bucket, paths] of storageByBucket) {
      if (!paths.length) continue
      const { error: removeErr } = await supabase.storage.from(bucket).remove(paths)
      if (removeErr) {
        return jsonError("Failed to cleanup storage objects", 502, {
          stage: "storage_cleanup",
          bucket,
          error: removeErr.message,
        })
      }
    }
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
      const { error: promoteErr } = await supabase
        .from("project_images")
        .update({ is_active: true })
        .eq("id", remainingImages[0].id)
      if (promoteErr) {
        return jsonError("Failed to promote remaining active image", 500, {
          stage: "promote_next_master",
          error: promoteErr.message,
        })
      }
    }
  }

  return NextResponse.json({ ok: true, deleted: count, transitiveCount: Math.max(0, deleteTargets.length - 1) })
}
