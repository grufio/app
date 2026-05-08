import { NextResponse } from "next/server"

import { isUuid, jsonError, readJson } from "@/lib/api/route-guards"
import { withFilterRouteAuth } from "@/lib/api/with-filter-route-auth"
import { pixelateSchema } from "@/lib/editor/filters/pixelate"
import { appendProjectImageFilter, cleanupOrphanFilterImage } from "@/services/editor/server/filter-chain"
import { pixelateImageAndActivate } from "@/services/editor/server/filters/pixelate"

export const dynamic = "force-dynamic"

type PixelateRequest = {
  source_image_id?: string
  superpixel_width?: number
  superpixel_height?: number
  color_mode?: string
  num_colors?: number
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  return withFilterRouteAuth(req, projectId, async (req, context) => {
    const parsed = await readJson<PixelateRequest>(req, { stage: "validation" })
    if (!parsed.ok) return parsed.res
    const body = parsed.value ?? {}
    const sourceImageId = String(body.source_image_id ?? "")
    if (!isUuid(sourceImageId)) {
      return jsonError("Invalid source_image_id", 400, { stage: "validation", where: "body" })
    }

    const paramsParsed = pixelateSchema.safeParse(body)
    if (!paramsParsed.success) {
      return jsonError("Invalid pixelate params", 400, { stage: "validation", where: "body" })
    }
    const filterParams = paramsParsed.data

    const result = await pixelateImageAndActivate({
      supabase: context.supabase,
      projectId: context.projectId,
      sourceImageId,
      params: filterParams,
    })

    if (!result.ok) {
      return jsonError(result.reason, result.status, { stage: result.stage, code: result.code })
    }

    const chain = await appendProjectImageFilter({
      supabase: context.supabase,
      projectId: context.projectId,
      inputImageId: sourceImageId,
      outputImageId: result.id,
      filterType: "pixelate",
      filterParams,
    })
    if (!chain.ok) {
      await cleanupOrphanFilterImage({
        supabase: context.supabase,
        projectId: context.projectId,
        imageId: result.id,
        storagePath: result.storagePath,
      })
      return jsonError(chain.reason, 400, { stage: chain.stage, code: chain.code })
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
