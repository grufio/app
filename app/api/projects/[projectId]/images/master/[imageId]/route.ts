/**
 * API route: delete a master image by id.
 *
 * Responsibilities:
 * - Delete storage object first, then DB record.
 * - If the active master was removed, promote the latest remaining master.
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

  const { data: img, error: imgErr } = await supabase
    .from("project_images")
    .select("id,storage_bucket,storage_path,is_active")
    .eq("project_id", projectId)
    .eq("role", "master")
    .eq("id", imageId)
    .is("deleted_at", null)
    .maybeSingle()

  if (imgErr) {
    return jsonError(imgErr.message, 400, { stage: "image_query" })
  }

  if (!img?.storage_path) {
    return NextResponse.json({ ok: true, deleted: false })
  }

  const bucket = img.storage_bucket || "project_images"
  const { error: rmErr } = await supabase.storage.from(bucket).remove([img.storage_path])
  if (rmErr) {
    return jsonError(rmErr.message, 400, { stage: "storage_policy", op: "remove", storage_path: img.storage_path })
  }

  const { error: delErr } = await supabase.from("project_images").delete().eq("id", img.id)
  if (delErr) {
    return jsonError(delErr.message, 400, { stage: "db_delete" })
  }

  if (img.is_active) {
    const { error: activeErr } = await supabase.rpc("set_active_master_latest", {
      p_project_id: projectId,
    })
    if (activeErr) {
      return jsonError(activeErr.message, 400, { stage: "active_switch" })
    }
  }

  return NextResponse.json({ ok: true, deleted: true })
}
