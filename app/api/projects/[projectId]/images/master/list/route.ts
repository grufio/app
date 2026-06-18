/**
 * API route: list master images for a project.
 *
 * Responsibilities:
 * - Return metadata for all non-deleted project images (no signed URLs).
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, jsonError, requireUser } from "@/lib/api/route-guards"
import { resolveEditorTargetImageRows } from "@/lib/supabase/project-images"
import { IMAGE_KIND, resolveImageKind } from "@/services/editor/server/image-kind"

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

  // Explicit access check for clearer error staging (RLS still enforces owner-only).
  const { data: projectRow, error: projectErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle()
  if (projectErr) {
    return jsonError("Failed to verify project access", 400, { stage: "project_access" })
  }
  if (!projectRow?.id) {
    return jsonError("Forbidden (project not accessible)", 403, { stage: "rls_denied", where: "project_access" })
  }

  const { data, error } = await supabase
    .from("project_images")
    .select("id,name,format,width_px,height_px,dpi,storage_path,storage_bucket,file_size_bytes,is_active,created_at,kind,source_image_id")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (error) {
    return jsonError(error.message, 400, { stage: "list_master" })
  }

  const uiItems = (data ?? []).filter((row) => resolveImageKind(row) !== IMAGE_KIND.MASTER)
  const masterRow = (data ?? []).find((row) => resolveImageKind(row) === IMAGE_KIND.MASTER)

  const resolved = await resolveEditorTargetImageRows(supabase, projectId)
  if (resolved.error) {
    return jsonError(resolved.error.reason, 400, { stage: "active_target_query", code: resolved.error.code })
  }
  // Lazy working-copy: when no working_copy or filter chain exists,
  // fall back to the master as the display target. The editor canvas
  // reads display_target to know which signed URL to render.
  const effectiveActive = resolved.target ?? masterRow ?? null
  const activeKind = effectiveActive ? resolveImageKind(effectiveActive) : null
  const preferredWorking = resolved.preferredWorking

  // `display_target.deletable` and `display_target.reason` used to
  // gate the UI delete buttons. After the master-delete-cascade
  // refactor those gates moved to `Boolean(masterImage)` on the
  // client, so the policy fields are no longer surfaced here.
  let fallbackTarget: { image_id: string; kind: typeof IMAGE_KIND.WORKING_COPY } | null = null
  if (activeKind === IMAGE_KIND.FILTER_WORKING_COPY) {
    if (preferredWorking?.id && preferredWorking.id !== effectiveActive?.id) {
      fallbackTarget = { image_id: String(preferredWorking.id), kind: IMAGE_KIND.WORKING_COPY }
    }
  }

  return NextResponse.json({
    items: uiItems,
    display_target: {
      active_image_id: effectiveActive?.id ? String(effectiveActive.id) : null,
      kind: activeKind,
    },
    fallback_target: fallbackTarget,
  })
}
