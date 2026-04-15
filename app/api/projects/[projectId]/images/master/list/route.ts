/**
 * API route: list master images for a project.
 *
 * Responsibilities:
 * - Return metadata for all non-deleted project images (no signed URLs).
 */
import { NextResponse } from "next/server"

import { withProjectRouteAuth } from "@/lib/api/with-project-route-auth"
import { jsonError } from "@/lib/api/route-guards"
import { resolveEditorTargetImageRows } from "@/lib/supabase/project-images"
import { evaluateDeleteTarget } from "@/services/editor/server/delete-target-policy"
import { resolveImageKind } from "@/services/editor/server/image-kind"

export const dynamic = "force-dynamic"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  return withProjectRouteAuth(req, projectId, async (_projectReq, context) => {
    const { data, error } = await context.supabase
      .from("project_images")
      .select("id,name,format,width_px,height_px,dpi,storage_path,storage_bucket,file_size_bytes,is_active,is_locked,created_at,role,kind,source_image_id")
      .eq("project_id", context.projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })

    if (error) {
      return jsonError(error.message, 400, { stage: "list_master" })
    }

    const uiItems = (data ?? []).filter((row) => resolveImageKind(row) !== "master")

    const resolved = await resolveEditorTargetImageRows(context.supabase, context.projectId)
    if (resolved.error) {
      return jsonError(resolved.error.reason, 400, { stage: "active_target_query", code: resolved.error.code })
    }
    const effectiveActive = resolved.target
    const activeKind = effectiveActive ? resolveImageKind(effectiveActive) : null
    const preferredWorking = resolved.preferredWorking

    const effectivePolicy = evaluateDeleteTarget({
      targetImageId: effectiveActive?.id ? String(effectiveActive.id) : null,
      targetKind: effectiveActive ? resolveImageKind(effectiveActive) : null,
    })
    let fallbackTarget: { image_id: string; kind: "working_copy" } | null = null
    if (activeKind === "filter_working_copy") {
      if (preferredWorking?.id && preferredWorking.id !== effectiveActive?.id) {
        fallbackTarget = { image_id: String(preferredWorking.id), kind: "working_copy" }
      }
    }

    return NextResponse.json({
      items: uiItems,
      display_target: {
        active_image_id: effectiveActive?.id ? String(effectiveActive.id) : null,
        kind: activeKind,
        deletable: effectivePolicy.deletable,
        reason: effectivePolicy.delete_reason,
      },
      fallback_target: fallbackTarget,
    })
  })
}
