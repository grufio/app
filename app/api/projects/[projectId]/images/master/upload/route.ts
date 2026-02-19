/**
 * API route: upload master image.
 *
 * Responsibilities:
 * - Accept an upload request and store the file in Supabase Storage.
 * - Insert/update `project_images` metadata for the project master role.
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, jsonError, requireUser } from "@/lib/api/route-guards"
import { uploadMasterImage } from "@/services/editor/server/master-image-upload"

export const dynamic = "force-dynamic"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })
  }
  const supabase = await createSupabaseServerClient()

  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  // Verify project is accessible under RLS (owner-only).
  const { data: projectRow, error: projectErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single()

  if (projectErr || !projectRow) {
    console.warn("master upload: project access denied", { projectId, code: (projectErr as unknown as { code?: string })?.code })
    return jsonError("Forbidden (project not accessible)", 403, { stage: "rls_denied", where: "project_access" })
  }

  const form = await req.formData().catch(() => null)
  if (!form) {
    return jsonError("Invalid multipart form data", 400, { stage: "validation", where: "body" })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return jsonError("Missing file", 400, { stage: "validation", where: "validate" })
  }

  const width_px = Number(form.get("width_px"))
  const height_px = Number(form.get("height_px"))
  const format = String(form.get("format") ?? "unknown")

  if (!Number.isFinite(width_px) || !Number.isFinite(height_px)) {
    return jsonError("Missing/invalid width_px/height_px", 400, { stage: "validation", where: "validate" })
  }

  const result = await uploadMasterImage({
    supabase,
    projectId,
    file,
    widthPx: width_px,
    heightPx: height_px,
    format,
  })
  if (!result.ok) {
    return jsonError(result.reason, result.status, {
      stage: result.stage,
      code: result.code,
      ...result.details,
    })
  }

  return NextResponse.json({ ok: true, id: result.id, storage_path: result.storagePath })
}

