import { NextResponse } from "next/server"

import { isUuid, jsonError, readJson } from "@/lib/api/route-guards"
import { withFilterRouteAuth } from "@/lib/api/with-filter-route-auth"
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
  smoothness?: number
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  return withFilterRouteAuth(req, projectId, async (req, context) => {
    const parsed = await readJson<LineArtRequest>(req, { stage: "validation" })
  if (!parsed.ok) return parsed.res
  const body = parsed.value ?? {}
  const sourceImageId = String(body.source_image_id ?? "")
  if (!isUuid(sourceImageId)) {
    return jsonError("Invalid source_image_id", 400, { stage: "validation", where: "body" })
  }

  const threshold1 = Number(body.threshold1 ?? 100)
  const threshold2 = Number(body.threshold2 ?? 200)
  const lineThickness = Number(body.line_thickness ?? 2)
  const invert = Boolean(body.invert)
  const blurAmount = Number(body.blur_amount ?? 3)
  const minContourArea = Number(body.min_contour_area ?? 200)
  const smoothness = Number(body.smoothness ?? 0.005)

  const result = await lineArtImageAndActivate({
    supabase: context.supabase,
    projectId: context.projectId,
    sourceImageId,
    params: {
      threshold1,
      threshold2,
      lineThickness,
      blurAmount,
      minContourArea,
      invert,
      smoothness,
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
  })
}
