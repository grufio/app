import { NextResponse } from "next/server"

import { isUuid, jsonError, readJson } from "@/lib/api/route-guards"
import { withFilterRouteAuth } from "@/lib/api/with-filter-route-auth"
import { applyFilterCommand } from "@/services/editor/server/filter-command"
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

    const superpixelWidth = Number(body.superpixel_width)
    const superpixelHeight = Number(body.superpixel_height)
    const numColors = Number(body.num_colors)
    const result = await applyFilterCommand({
      supabase: context.supabase,
      projectId: context.projectId,
      sourceImageId,
      filterType: "pixelate",
      filterParams: {
        superpixel_width: superpixelWidth,
        superpixel_height: superpixelHeight,
        color_mode: colorMode,
        num_colors: numColors,
      },
      runFilter: () =>
        pixelateImageAndActivate({
          supabase: context.supabase,
          projectId: context.projectId,
          sourceImageId,
          params: {
            superpixelWidth,
            superpixelHeight,
            colorMode: colorMode as "rgb" | "grayscale",
            numColors,
          },
        }),
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
