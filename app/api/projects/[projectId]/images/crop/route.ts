import { NextResponse } from "next/server"

import { isUuid, jsonError, readJson, requireUser } from "@/lib/api/route-guards"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { cropImageAndActivate } from "@/services/editor/server/crop-image"

export const dynamic = "force-dynamic"

type CropRequest = {
  source_image_id?: string
  x?: number
  y?: number
  w?: number
  h?: number
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })
  }

  const supabase = await createSupabaseServerClient()
  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  // Explicit access check for better staged errors (RLS still enforces).
  const { data: projectRow, error: projectErr } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle()
  if (projectErr) return jsonError("Failed to verify project access", 400, { stage: "project_access" })
  if (!projectRow?.id) return jsonError("Forbidden (project not accessible)", 403, { stage: "rls_denied", where: "project_access" })

  const parsed = await readJson<CropRequest>(req, { stage: "validation" })
  if (!parsed.ok) return parsed.res
  const body = parsed.value ?? {}
  const sourceImageId = String(body.source_image_id ?? "")
  if (!isUuid(sourceImageId)) {
    return jsonError("Invalid source_image_id", 400, { stage: "validation", where: "body" })
  }

  const result = await cropImageAndActivate({
    supabase,
    projectId,
    sourceImageId,
    rect: {
      x: Number(body.x),
      y: Number(body.y),
      w: Number(body.w),
      h: Number(body.h),
    },
  })

  if (!result.ok) {
    return jsonError(result.reason, result.status, { stage: result.stage, code: result.code })
  }

  return NextResponse.json({
    ok: true,
    id: result.id,
    storage_path: result.storagePath,
    width_px: result.widthPx,
    height_px: result.heightPx,
  })
}
