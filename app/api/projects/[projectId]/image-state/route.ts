/**
 * API route: persisted image state (transform) for a project.
 *
 * Responsibilities:
 * - GET: read `project_image_state` for the master role.
 * - POST: validate and upsert µpx-based transform state.
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
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

  const { data, error } = await supabase
    .from("project_image_state")
    .select("project_id,role,x_px_u,y_px_u,width_px_u,height_px_u,rotation_deg")
    .eq("project_id", projectId)
    .eq("role", "master")
    .maybeSingle()

  if (error) {
    return jsonError(error.message, 400, { stage: "select_state" })
  }

  if (data && (!data.width_px_u || !data.height_px_u)) {
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
    ...validated,
  }

  const { error: errV2 } = await supabase.from("project_image_state").upsert(baseRow, { onConflict: "project_id,role" })

  if (errV2) {
    return jsonError(errV2.message, 400, { stage: "upsert" })
  }

  return NextResponse.json({ ok: true })
}

