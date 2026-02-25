import { NextResponse } from "next/server"

import { isUuid, jsonError, requireUser } from "@/lib/api/route-guards"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getOrCreateFilterWorkingCopy } from "@/services/editor/server/filter-working-copy"

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

  const result = await getOrCreateFilterWorkingCopy({ supabase, projectId })

  if (!result.ok) {
    return jsonError(result.reason, result.status, { stage: result.stage, code: result.code })
  }

  return NextResponse.json({
    ok: true,
    id: result.id,
    storage_path: result.storagePath,
    width_px: result.widthPx,
    height_px: result.heightPx,
    signed_url: result.signedUrl,
    source_image_id: result.sourceImageId,
    name: result.name,
  })
}
