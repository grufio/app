/**
 * API route: persisted image state (transform) for a project.
 *
 * Responsibilities:
 * - GET: read `project_image_state` for the master role.
 * - POST: validate and upsert µpx-based transform state.
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getActiveMasterImageId } from "@/lib/supabase/project-images"
import { loadBoundImageState, upsertBoundImageState } from "@/lib/supabase/image-state"
import { isUuid, jsonError, readJson, requireUser } from "@/lib/api/route-guards"
import { validateIncomingImageStateUpsert, type IncomingImageStatePayload } from "@/lib/editor/imageState"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })
  }
  const supabase = await createSupabaseServerClient()

  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  const { imageId: activeImageId, error: activeErr } = await getActiveMasterImageId(supabase, projectId)
  if (activeErr) return jsonError(activeErr, 400, { stage: "active_image_lookup" })
  if (!activeImageId) {
    return NextResponse.json({ exists: false, state: null })
  }

  const { row: data, error: readErr, unsupported } = await loadBoundImageState(supabase, projectId, activeImageId)
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

  // Explicit access check for clearer error staging (RLS still enforces owner-only).
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

  // µpx schema required.
  const baseRow = {
    project_id: projectId,
    image_id: "",
    ...validated,
  }

  // Never trust client-provided image identity; bind state to current active master.
  const { imageId: activeImageIdForWrite, error: activeErr } = await getActiveMasterImageId(supabase, projectId)
  if (activeErr) return jsonError(activeErr, 400, { stage: "active_image_lookup" })
  if (!activeImageIdForWrite) {
    return jsonError("No active master image", 409, { stage: "active_image_lookup" })
  }
  baseRow.image_id = activeImageIdForWrite

  const upsert = await upsertBoundImageState(supabase, {
    project_id: baseRow.project_id,
    image_id: baseRow.image_id,
    role: baseRow.role,
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

