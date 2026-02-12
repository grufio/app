/**
 * API route: list master images for a project.
 *
 * Responsibilities:
 * - Return metadata for all master images (no signed URLs).
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, jsonError, requireUser } from "@/lib/api/route-guards"

export const dynamic = "force-dynamic"

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

  const { data, error } = await supabase
    .from("project_images")
    .select("id,name,format,width_px,height_px,dpi,storage_path,storage_bucket,file_size_bytes,is_active,created_at")
    .eq("project_id", projectId)
    .eq("role", "master")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (error) {
    return jsonError(error.message, 400, { stage: "list_master" })
  }

  return NextResponse.json({ items: data ?? [] })
}
