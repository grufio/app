import { NextResponse } from "next/server"

import { isUuid, jsonError, readJson } from "@/lib/api/route-guards"
import { withFilterRouteAuth } from "@/lib/api/with-filter-route-auth"
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

    const colorMode = String(body.color_mode ?? "rgb")
    if (colorMode !== "rgb" && colorMode !== "grayscale") {
      return jsonError("Invalid color_mode (must be rgb or grayscale)", 400, { stage: "validation", where: "body" })
    }

    const result = await pixelateImageAndActivate({
      supabase: context.supabase,
      projectId: context.projectId,
      sourceImageId,
      params: {
        superpixelWidth: Number(body.superpixel_width),
        superpixelHeight: Number(body.superpixel_height),
        colorMode: colorMode as "rgb" | "grayscale",
        numColors: Number(body.num_colors),
      },
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
      filterParams: {
        superpixel_width: Number(body.superpixel_width),
        superpixel_height: Number(body.superpixel_height),
        color_mode: colorMode,
        num_colors: Number(body.num_colors),
      },
    })
    if (!chain.ok) {
      await cleanupOrphanFilterImage({
        supabase: context.supabase,
        projectId: context.projectId,
        imageId: result.id,
        storagePath: result.storagePath,
      })
      return jsonError(chain.reason, 400, { stage: "db_insert", code: chain.code })
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
