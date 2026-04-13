import type { SupabaseClient } from "@supabase/supabase-js"

import { type IncomingImageStatePayload, validateIncomingImageStateUpsert } from "@/lib/editor/imageState"
import { isUuid } from "@/lib/api/route-guards"
import { getEditorTargetImageRow } from "@/lib/supabase/project-images"
import { loadBoundImageState, upsertBoundImageState } from "@/lib/supabase/image-state"

function resolveImageStateRole(value: unknown): "master" | "working" | "asset" {
  const role = String(value ?? "").toLowerCase()
  if (role === "working") return "working"
  if (role === "asset") return "asset"
  return "master"
}

export type ImageStateGetResult =
  | { ok: true; exists: false; state: null }
  | { ok: true; exists: true; state: unknown }
  | { ok: false; status: number; stage: string; reason: string; code?: string }

export async function loadProjectImageState(args: {
  supabase: SupabaseClient
  projectId: string
  queryImageId: string | null
}): Promise<ImageStateGetResult> {
  const { supabase, projectId, queryImageId } = args
  const useQueryImageId = queryImageId && isUuid(queryImageId)
  let targetImageId: string | null = null

  if (useQueryImageId) {
    targetImageId = queryImageId
  } else {
    const editorTargetLookup = await getEditorTargetImageRow(supabase, projectId)
    if (editorTargetLookup.error) {
      return { ok: false, status: 400, stage: editorTargetLookup.error.stage, reason: editorTargetLookup.error.reason, code: editorTargetLookup.error.code }
    }
    if (!editorTargetLookup.row?.id) return { ok: true, exists: false, state: null }
    targetImageId = editorTargetLookup.row.id
  }

  if (!targetImageId) return { ok: true, exists: false, state: null }

  const { row: data, error: readErr, unsupported } = await loadBoundImageState(supabase, projectId, targetImageId)
  if (readErr) return { ok: false, status: 400, stage: "select_state", reason: readErr }
  if (unsupported) {
    return {
      ok: false,
      status: 400,
      stage: "schema_missing",
      reason: "Unsupported image state: missing width_px_u/height_px_u",
    }
  }

  return { ok: true, exists: Boolean(data), state: data ?? null }
}

export type ImageStatePostResult =
  | { ok: true }
  | {
      ok: false
      status: number
      stage: string
      reason: string
      code?: string
      where?: string
      expectedImageId?: string
    }

export async function saveProjectImageState(args: {
  supabase: SupabaseClient
  projectId: string
  body: IncomingImageStatePayload
}): Promise<ImageStatePostResult> {
  const { supabase, projectId, body } = args
  const validated = validateIncomingImageStateUpsert(body)
  if (!validated) return { ok: false, status: 400, stage: "validation", reason: "Invalid fields", where: "validate" }
  if (!isUuid(validated.image_id)) {
    return { ok: false, status: 400, stage: "validation", reason: "Invalid image_id", where: "image_id" }
  }

  const baseRow = {
    project_id: projectId,
    ...validated,
  }

  const editorTargetLookup = await getEditorTargetImageRow(supabase, projectId)
  if (editorTargetLookup.error) {
    return { ok: false, status: 400, stage: editorTargetLookup.error.stage, reason: editorTargetLookup.error.reason, code: editorTargetLookup.error.code }
  }
  if (!editorTargetLookup.row?.id) {
    return { ok: false, status: 409, stage: "no_active_image", reason: "No editor target image" }
  }

  const editorTargetImageIdForWrite = editorTargetLookup.row.id
  if (baseRow.image_id !== editorTargetImageIdForWrite) {
    return {
      ok: false,
      status: 409,
      stage: "active_image_mismatch",
      reason: "Image state target is not the editor target image",
      expectedImageId: editorTargetImageIdForWrite,
    }
  }

  const { data: editorTargetImageRow, error: editorTargetImageErr } = await supabase
    .from("project_images")
    .select("is_locked,role")
    .eq("project_id", projectId)
    .eq("id", editorTargetImageIdForWrite)
    .is("deleted_at", null)
    .maybeSingle()
  if (editorTargetImageErr) {
    return { ok: false, status: 400, stage: "lock_guard_query", reason: editorTargetImageErr.message, code: editorTargetImageErr.code }
  }
  if (editorTargetImageRow?.is_locked) {
    return { ok: false, status: 409, stage: "lock_conflict", reason: "Editor target image is locked", code: "image_locked" }
  }

  const upsert = await upsertBoundImageState(supabase, {
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
    return { ok: false, status: 400, stage: "upsert", reason: upsert.error }
  }

  return { ok: true }
}
