import { NextResponse } from "next/server"

import { isUuid, jsonError, readJson, requireUser } from "@/lib/api/route-guards"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { lineArtImageAndActivate } from "@/services/editor/server/filters/lineart"

export const dynamic = "force-dynamic"

type LineArtRequest = {
  source_image_id?: string
  threshold1?: number
  threshold2?: number
  line_thickness?: number
  blur_amount?: number
  min_contour_area?: number
  invert?: boolean
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

  const { data: projectRow, error: projectErr } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle()
  if (projectErr) return jsonError("Failed to verify project access", 400, { stage: "project_access" })
  if (!projectRow?.id) return jsonError("Forbidden (project not accessible)", 403, { stage: "rls_denied", where: "project_access" })

  const parsed = await readJson<LineArtRequest>(req, { stage: "validation" })
  if (!parsed.ok) return parsed.res
  const body = parsed.value ?? {}
  const sourceImageId = String(body.source_image_id ?? "")
  if (!isUuid(sourceImageId)) {
    return jsonError("Invalid source_image_id", 400, { stage: "validation", where: "body" })
  }

  const threshold1 = Number(body.threshold1 ?? 100)
  const threshold2 = Number(body.threshold2 ?? 200)
  const lineThickness = Number(body.line_thickness ?? 1)
  const invert = Boolean(body.invert)
  const blurAmount = Number(body.blur_amount ?? 0)
  const minContourArea = Number(body.min_contour_area ?? 100)

  const result = await lineArtImageAndActivate({
    supabase,
    projectId,
    sourceImageId,
    params: {
      threshold1,
      threshold2,
      lineThickness,
      blurAmount,
      minContourArea,
      invert,
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
