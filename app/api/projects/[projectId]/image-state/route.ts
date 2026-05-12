/**
 * API route: persisted image state (transform) for a project.
 *
 * Responsibilities:
 * - GET: read `project_image_state` for the project (anchored at master.id).
 * - POST: validate transform fields, then upsert at master.id.
 *
 * State is always anchored at the project's master.id (PR #124). The
 * client sends only transform fields; the server resolves the
 * persistence key and the lock-guard target from `projectId` alone.
 * Legacy clients still in flight may include `image_id` and `role`
 * in the body — both are accepted by the validator and ignored.
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getProjectMasterImageRow } from "@/lib/supabase/project-images"
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

  const { row: masterRow, error: masterErr } = await getProjectMasterImageRow(supabase, projectId)
  if (masterErr) return jsonError(masterErr, 400, { stage: "master_lookup" })
  if (!masterRow) {
    return NextResponse.json({ exists: false, state: null })
  }

  const { row: data, error: readErr, unsupported } = await loadBoundImageState(supabase, projectId, masterRow.id)
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

  // Persistence + lock-guard both anchor at the project's master row.
  // Single query fetches id + is_locked.
  const { row: masterRow, error: masterErr } = await getProjectMasterImageRow(supabase, projectId)
  if (masterErr) return jsonError(masterErr, 400, { stage: "master_lookup" })
  if (!masterRow) {
    return jsonError("Project has no master image", 409, { stage: "no_master_image" })
  }
  if (masterRow.is_locked) {
    return jsonError("Master image is locked", 409, { stage: "lock_conflict", reason: "image_locked" })
  }

  // Per-axis preservation: when the payload omits x_px_u or y_px_u
  // (validator returns `undefined`), read the current row at master.id
  // and fill in the unchanged axis from there. We only do the read
  // when needed so the common full-payload case (drag-end, alignImage,
  // restoreImage) keeps a single round-trip.
  let resolvedXPxU: string | null = validated.x_px_u ?? null
  let resolvedYPxU: string | null = validated.y_px_u ?? null
  if (validated.x_px_u === undefined || validated.y_px_u === undefined) {
    const existing = await loadBoundImageState(supabase, projectId, masterRow.id)
    if (existing.error) {
      return jsonError(existing.error, 400, { stage: "select_existing_for_merge" })
    }
    if (validated.x_px_u === undefined) resolvedXPxU = existing.row?.x_px_u ?? null
    if (validated.y_px_u === undefined) resolvedYPxU = existing.row?.y_px_u ?? null
  }

  const upsert = await upsertBoundImageState(supabase, {
    project_id: projectId,
    image_id: masterRow.id,
    x_px_u: resolvedXPxU,
    y_px_u: resolvedYPxU,
    width_px_u: validated.width_px_u,
    height_px_u: validated.height_px_u,
    rotation_deg: validated.rotation_deg,
  })
  if (!upsert.ok) {
    return jsonError(upsert.error, 400, { stage: "upsert" })
  }

  return NextResponse.json({ ok: true })
}
