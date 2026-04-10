import { NextResponse } from "next/server"

import { isUuid, jsonError, requireUser } from "@/lib/api/route-guards"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getFilterPanelData } from "@/services/editor/server/filter-working-copy"

export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params

  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })
  }

  const supabase = await createSupabaseServerClient()
  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  const { data: projectRow, error: projectErr } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle()
  if (projectErr) return jsonError("Failed to verify project access", 400, { stage: "project_access" })
  if (!projectRow?.id) return jsonError("Forbidden (project not accessible)", 403, { stage: "rls_denied", where: "project_access" })

  const result = await getFilterPanelData({ supabase, projectId })

  if (!result.ok) {
    if (result.stage === "no_active_image") {
      return NextResponse.json({ ok: true, exists: false, stage: "no_active_image" })
    }
    return jsonError(result.reason, result.status, { stage: result.stage, code: result.code })
  }

  return NextResponse.json({
    ok: true,
    exists: true,
    id: result.display.id,
    storage_path: result.display.storagePath,
    width_px: result.display.widthPx,
    height_px: result.display.heightPx,
    signed_url: result.display.signedUrl,
    source_image_id: result.display.sourceImageId,
    name: result.display.name,
    is_filter_result: result.display.isFilterResult,
    stack: result.stack,
  })
}
