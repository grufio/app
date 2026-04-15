/**
 * API route: persisted image state (transform) for a project.
 *
 * Responsibilities:
 * - GET: read `project_image_state` for the master role or specific image.
 * - POST: validate and upsert µpx-based transform state.
 */
import { NextResponse } from "next/server"

import { withProjectRouteAuth } from "@/lib/api/with-project-route-auth"
import { getEditorTargetImageRow } from "@/lib/supabase/project-images"
import { loadBoundImageState, upsertBoundImageState } from "@/lib/supabase/image-state"
import { isUuid, jsonError, readJson } from "@/lib/api/route-guards"
import { validateIncomingImageStateUpsert, type IncomingImageStatePayload } from "@/lib/editor/imageState"

export const dynamic = "force-dynamic"

function resolveImageStateRole(value: unknown): "master" | "working" | "asset" {
  const role = String(value ?? "").toLowerCase()
  if (role === "working") return "working"
  if (role === "asset") return "asset"
  return "master"
}

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const url = new URL(req.url)
  const queryImageId = url.searchParams.get("imageId")
  const useQueryImageId = queryImageId && isUuid(queryImageId)

  const { projectId } = await params
  return withProjectRouteAuth(req, projectId, async (_req, context) => {
    let targetImageId: string | null = null

    if (useQueryImageId) {
      targetImageId = queryImageId
    } else {
      const editorTargetLookup = await getEditorTargetImageRow(context.supabase, context.projectId)
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

    const { row: data, error: readErr, unsupported } = await loadBoundImageState(context.supabase, context.projectId, targetImageId)
    if (readErr) return jsonError(readErr, 400, { stage: "select_state" })
    if (unsupported) {
      return jsonError("Unsupported image state: missing width_px_u/height_px_u", 400, { stage: "schema_missing", where: "validate_state" })
    }

    return NextResponse.json({ exists: Boolean(data), state: data ?? null })
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  return withProjectRouteAuth(req, projectId, async (projectReq, context) => {
    const parsed = await readJson<IncomingImageStatePayload>(projectReq, { stage: "validation" })
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
      project_id: context.projectId,
      ...validated,
    }

    const editorTargetLookup = await getEditorTargetImageRow(context.supabase, context.projectId)
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
    const { data: editorTargetImageRow, error: editorTargetImageErr } = await context.supabase
      .from("project_images")
      .select("is_locked,role")
      .eq("project_id", context.projectId)
      .eq("id", editorTargetImageIdForWrite)
      .is("deleted_at", null)
      .maybeSingle()
    if (editorTargetImageErr) return jsonError(editorTargetImageErr.message, 400, { stage: "lock_guard_query" })
    if (editorTargetImageRow?.is_locked) {
      return jsonError("Editor target image is locked", 409, { stage: "lock_conflict", reason: "image_locked" })
    }
    const upsert = await upsertBoundImageState(context.supabase, {
      project_id: baseRow.project_id,
      image_id: baseRow.image_id,
      role: resolveImageStateRole(editorTargetImageRow?.role),
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
  })
}
