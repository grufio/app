import { NextResponse } from "next/server"

import { withProjectRouteAuth } from "@/lib/api/with-project-route-auth"
import { isUuid, jsonError, readJson } from "@/lib/api/route-guards"
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
  return withProjectRouteAuth(req, projectId, async (projectReq, context) => {
    const parsed = await readJson<CropRequest>(projectReq, { stage: "validation" })
    if (!parsed.ok) return parsed.res
    const body = parsed.value ?? {}
    const sourceImageId = String(body.source_image_id ?? "")
    if (!isUuid(sourceImageId)) {
      return jsonError("Invalid source_image_id", 400, { stage: "validation", where: "body" })
    }

    const result = await cropImageAndActivate({
      supabase: context.supabase,
      projectId: context.projectId,
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
  })
}
