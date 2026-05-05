/**
 * API route: persisted image state (transform) for a project.
 *
 * Responsibilities:
 * - GET: read `project_image_state` for the master role or specific image.
 * - POST: validate and upsert µpx-based transform state.
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getEditorTargetImageRow, resolveImageStateRoleFromProjectImage } from "@/lib/supabase/project-images"
import { loadBoundImageState, upsertBoundImageState } from "@/lib/supabase/image-state"
import { isUuid, jsonError, readJson, requireUser } from "@/lib/api/route-guards"
import { validateIncomingImageStateUpsert, type IncomingImageStatePayload } from "@/lib/editor/imageState"

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const url = new URL(req.url)
  const queryImageId = url.searchParams.get("imageId")
  const useQueryImageId = queryImageId && isUuid(queryImageId)

  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })
  }
  const supabase = await createSupabaseServerClient()

  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  let targetImageId: string | null = null

  if (useQueryImageId) {
    targetImageId = queryImageId
  } else {
    const editorTargetLookup = await getEditorTargetImageRow(supabase, projectId)
    if (editorTargetLookup.error) {
      return jsonError(editorTargetLookup.error.reason, 400, {
        stage: editorTargetLookup.error.stage,
        code: editorTargetLookup.error.code,
      })
    }
    if (!editorTargetLookup.row?.id) {
      return NextResponse.json({ exists: false, state: null })
    }
    targetImageId = editorTargetLookup.row.id
  }

  if (!targetImageId) {
    return NextResponse.json({ exists: false, state: null })
  }

  const { row: data, error: readErr, unsupported } = await loadBoundImageState(supabase, projectId, targetImageId)
  if (readErr) return jsonError(readErr, 400, { stage: "select_state" })
  if (unsupported) {
    return jsonError("Unsupported image state: missing width_px_u/height_px_u", 400, { stage: "schema_missing", where: "validate_state" })
  }

  return NextResponse.json({ exists: Boolean(data), state: data ?? null })
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })
  }
  const supabase = await createSupabaseServerClient()

  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  const { data: projectRow, error: projectErr } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle()
  if (projectErr) {
    console.warn("image-state: project access query failed", { projectId, message: projectErr.message })
    return jsonError("Failed to verify project access", 400, { stage: "project_access" })
  }
  if (!projectRow?.id) {
    return jsonError("Forbidden (project not accessible)", 403, { stage: "rls_denied", where: "project_access" })
  }

  const parsed = await readJson<IncomingImageStatePayload>(req, { stage: "validation" })
  if (!parsed.ok) return parsed.res
  const body: IncomingImageStatePayload = parsed.value

  const validated = validateIncomingImageStateUpsert(body)
  if (!validated) {
    return jsonError("Invalid fields", 400, { stage: "validation", where: "validate" })
  }
  if (!isUuid(validated.image_id)) {
    return jsonError("Invalid image_id", 400, { stage: "validation", where: "image_id" })
  }

  const baseRow = {
    project_id: projectId,
    ...validated,
  }

  const editorTargetLookup = await getEditorTargetImageRow(supabase, projectId)
  if (editorTargetLookup.error) {
    return jsonError(editorTargetLookup.error.reason, 400, {
      stage: editorTargetLookup.error.stage,
      code: editorTargetLookup.error.code,
    })
  }
  if (!editorTargetLookup.row?.id) {
    return jsonError("No editor target image", 409, { stage: "no_active_image" })
  }
  const editorTargetImageIdForWrite = editorTargetLookup.row.id
  if (baseRow.image_id !== editorTargetImageIdForWrite) {
    return jsonError("Image state target is not the editor target image", 409, {
      stage: "active_image_mismatch",
      expected_image_id: editorTargetImageIdForWrite,
    })
  }
  const { data: editorTargetImageRow, error: editorTargetImageErr } = await supabase
    .from("project_images")
    .select("is_locked,kind")
    .eq("project_id", projectId)
    .eq("id", editorTargetImageIdForWrite)
    .is("deleted_at", null)
    .maybeSingle()
  if (editorTargetImageErr) return jsonError(editorTargetImageErr.message, 400, { stage: "lock_guard_query" })
  if (editorTargetImageRow?.is_locked) {
    return jsonError("Editor target image is locked", 409, { stage: "lock_conflict", reason: "image_locked" })
  }
  const upsert = await upsertBoundImageState(supabase, {
    project_id: baseRow.project_id,
    image_id: baseRow.image_id,
    role: resolveImageStateRoleFromProjectImage(editorTargetImageRow),
    x_px_u: baseRow.x_px_u,
    y_px_u: baseRow.y_px_u,
    width_px_u: baseRow.width_px_u,
    height_px_u: baseRow.height_px_u,
    rotation_deg: baseRow.rotation_deg,
  })
  if (!upsert.ok) {
    return jsonError(upsert.error, 400, { stage: "upsert" })
  }

  return NextResponse.json({ ok: true })
}
