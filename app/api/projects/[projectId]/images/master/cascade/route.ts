/**
 * API route: cascade-delete the project's master image.
 *
 * DELETE removes the master row plus every derivative
 * (working_copy, filter_working_copy, trace_output via source_image_id
 * chain), all `project_image_filters` rows, the `project_image_state`
 * row, the `project_image_trace` row, and the storage objects in the
 * `project_images` bucket. The project shell itself survives so the
 * user can upload a new image.
 *
 * Why this exists (separate from `master/route.ts` DELETE which
 * handles single-variant deletes): the cascade flow needs
 *   1. filter rows removed (FK RESTRICT from
 *      `project_image_filters.input_image_id`/`output_image_id` would
 *      otherwise block the image delete)
 *   2. the `guard_master_immutable` trigger suspended for this
 *      transaction (otherwise the master row delete raises)
 *   3. ordered per-kind delete of `project_images` rows (the self-ref
 *      FK is ON DELETE RESTRICT, leaves before parents)
 * All three live in the `delete_master_with_cascade` RPC. This route
 * is the thin HTTP layer that calls it and does storage cleanup.
 *
 * Auth: requires logged-in user. RLS on `projects` gates access
 * (RPC runs as caller, no security definer).
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, jsonError, requireUser } from "@/lib/api/route-guards"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"

export const dynamic = "force-dynamic"

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

  // Project access gate (same shape as the sibling master/route.ts).
  // RLS on `projects.SELECT` is the source of truth — we just
  // surface a clean 403 instead of letting the RPC error bubble.
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle()
  if (projErr) {
    return jsonError("Failed to verify project access", 400, { stage: "project_access" })
  }
  if (!project?.id) {
    return jsonError("Forbidden (project not accessible)", 403, {
      stage: "rls_denied",
      where: "project_access",
    })
  }

  const { data: paths, error: rpcErr } = await supabase.rpc("delete_master_with_cascade", {
    p_project_id: projectId,
  })
  if (rpcErr) {
    return jsonError("Failed to delete master image", 500, {
      stage: "rpc",
      error: rpcErr.message,
    })
  }

  // Storage cleanup: best-effort, batched per bucket. DB is the
  // source of truth — if a remove call fails, we log and continue
  // (the storage object orphans, but the DB is consistent).
  const rows = Array.isArray(paths)
    ? (paths as Array<{ storage_bucket: string | null; storage_path: string | null }>)
    : []
  const byBucket = new Map<string, string[]>()
  for (const r of rows) {
    if (!r.storage_path) continue
    const bucket = r.storage_bucket ?? PROJECT_IMAGES_BUCKET
    const arr = byBucket.get(bucket) ?? []
    arr.push(r.storage_path)
    byBucket.set(bucket, arr)
  }
  const storageCleanupFailures: Array<{ bucket: string; error: string }> = []
  for (const [bucket, ps] of byBucket) {
    if (!ps.length) continue
    const { error: removeErr } = await supabase.storage.from(bucket).remove(ps)
    if (removeErr) {
      storageCleanupFailures.push({ bucket, error: removeErr.message })
    }
  }
  if (storageCleanupFailures.length > 0) {
    console.warn("master-cascade: storage cleanup incomplete", {
      projectId,
      failures: storageCleanupFailures,
    })
  }

  return NextResponse.json({
    ok: true,
    deleted_count: rows.length,
    storage_cleanup_failures: storageCleanupFailures,
  })
}
