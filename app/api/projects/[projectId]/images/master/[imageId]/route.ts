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
import { getEditorTargetImageRow } from "@/lib/supabase/project-images"
import { evaluateDeleteTarget } from "@/services/editor/server/delete-target-policy"
import { IMAGE_KIND, resolveImageKind } from "@/services/editor/server/image-kind"

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

  // Fetch the explicit image target.
  const { data: imageToDelete, error: fetchErr } = await supabase
    .from("project_images")
    .select("id,storage_path,storage_bucket,is_active,is_locked,kind,source_image_id,name")
    .eq("id", imageId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle()

  if (fetchErr) {
    return jsonError("Failed to fetch image", 400, { stage: "fetch_image" })
  }
  if (!imageToDelete) {
    const targetLookup = await getEditorTargetImageRow(supabase, projectId)
    if (targetLookup.error) {
      return jsonError(targetLookup.error.reason, 400, { stage: targetLookup.error.stage, code: targetLookup.error.code })
    }
    if (!targetLookup.row?.id) {
      return jsonError("Image not found", 404, { stage: "not_found" })
    }
    return jsonError("Delete target is stale. Refresh selection.", 409, {
      stage: "stale_selection",
      current_image_id: targetLookup.row.id,
    })
  }

  const targetKind = resolveImageKind(imageToDelete)
  const policy = evaluateDeleteTarget({
    targetImageId: imageToDelete.id ? String(imageToDelete.id) : null,
    targetKind,
  })
  if (!policy.deletable) {
    if (policy.delete_reason === "master_immutable") {
      return jsonError("Master image is immutable. Use restore/replace flow.", 409, { stage: "master_immutable" })
    }
    return jsonError("No active image available for delete", 409, { stage: "no_active_image" })
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
    .neq("kind", "master")

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

  let fallbackTarget: { image_id: string; kind: typeof IMAGE_KIND.WORKING_COPY } | null = null
  let fallbackStage: "fallback_applied" | "no_working_copy" | "delete_ok" = "delete_ok"
  // If we deleted the active image, promote working_copy only.
  if (wasActive) {
    const { data: remainingImages } = await supabase
      .from("project_images")
      .select("id,kind,source_image_id,name")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })

    const working = (remainingImages ?? []).find((row) => resolveImageKind(row) === IMAGE_KIND.WORKING_COPY)
    const promote = working
    if (promote) {
      const kind = resolveImageKind(promote)
      const { error: promoteErr } = await supabase
        .from("project_images")
        .update({ is_active: true })
        .eq("id", promote.id)
      if (promoteErr) {
        return jsonError("Failed to promote remaining active image", 500, {
          stage: "promote_next_master",
          error: promoteErr.message,
        })
      }
      fallbackTarget =
        kind === IMAGE_KIND.WORKING_COPY
          ? { image_id: String(promote.id), kind: IMAGE_KIND.WORKING_COPY }
          : null
      fallbackStage = fallbackTarget ? "fallback_applied" : "delete_ok"
    } else {
      fallbackStage = "no_working_copy"
    }
  }

  return NextResponse.json({
    ok: true,
    deleted: count,
    transitiveCount: Math.max(0, deleteTargets.length - 1),
    stage: fallbackStage,
    fallback_target: fallbackTarget,
  })
}
