/**
 * API route: persisted image state (transform) for a project.
 *
 * Responsibilities:
 * - GET: read `project_image_state` for the project (anchored at master.id).
 * - POST: validate body image (in-project, not locked), then upsert
 *   the µpx-based transform state at master.id.
 *
 * State is always anchored at the project's master.id — see
 * `getProjectMasterImageId` in `lib/supabase/project-images.ts` for
 * the rationale. The body's `image_id` is treated as informational
 * (identifies which editor surface the user was operating on, used
 * for the lock-guard check), not as the persistence key.
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getProjectMasterImageId } from "@/lib/supabase/project-images"
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

  const { masterId, error: masterErr } = await getProjectMasterImageId(supabase, projectId)
  if (masterErr) return jsonError(masterErr, 400, { stage: "master_lookup" })
  if (!masterId) {
    return NextResponse.json({ exists: false, state: null })
  }

  const { row: data, error: readErr, unsupported } = await loadBoundImageState(supabase, projectId, masterId)
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

  // Validate the body-specified image belongs to the project and isn't
  // locked. This is a guard against editing a row the user shouldn't
  // be operating on — separate from the persistence target, which is
  // always master.id (see below).
  const { data: bodyImageRow, error: bodyImageErr } = await supabase
    .from("project_images")
    .select("id,is_locked")
    .eq("project_id", projectId)
    .eq("id", validated.image_id)
    .is("deleted_at", null)
    .maybeSingle()
  if (bodyImageErr) return jsonError(bodyImageErr.message, 400, { stage: "lock_guard_query" })
  if (!bodyImageRow?.id) {
    return jsonError("Image not found in project", 404, { stage: "image_not_in_project" })
  }
  if (bodyImageRow.is_locked) {
    return jsonError("Editor target image is locked", 409, { stage: "lock_conflict", reason: "image_locked" })
  }

  // Anchor: persist state at the project's master.id regardless of
  // which editor surface (working_copy / filter_working_copy /
  // trace_output) the client was rendering. State survives filter
  // chain resets and stays consistent between SSR and client.
  const { masterId, error: masterErr } = await getProjectMasterImageId(supabase, projectId)
  if (masterErr) return jsonError(masterErr, 400, { stage: "master_lookup" })
  if (!masterId) {
    return jsonError("Project has no master image", 409, { stage: "no_master_image" })
  }

  // Per-axis preservation: when the payload omits x_px_u or y_px_u
  // (validator returns `undefined`), read the current row at master.id
  // and fill in the unchanged axis from there. We only do the read
  // when needed so the common full-payload case (drag-end, alignImage,
  // restoreImage) keeps a single round-trip.
  let resolvedXPxU: string | null = validated.x_px_u ?? null
  let resolvedYPxU: string | null = validated.y_px_u ?? null
  if (validated.x_px_u === undefined || validated.y_px_u === undefined) {
    const existing = await loadBoundImageState(supabase, projectId, masterId)
    if (existing.error) {
      return jsonError(existing.error, 400, { stage: "select_existing_for_merge" })
    }
    if (validated.x_px_u === undefined) resolvedXPxU = existing.row?.x_px_u ?? null
    if (validated.y_px_u === undefined) resolvedYPxU = existing.row?.y_px_u ?? null
  }

  const upsert = await upsertBoundImageState(supabase, {
    project_id: projectId,
    image_id: masterId,
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
