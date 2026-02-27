import { NextResponse } from "next/server"

import { isUuid, jsonError, readJson } from "@/lib/api/route-guards"
import { withFilterRouteAuth } from "@/lib/api/with-filter-route-auth"
import { appendProjectImageFilter, cleanupOrphanFilterImage } from "@/services/editor/server/filter-chain"
import { numerateImageAndActivate } from "@/services/editor/server/filters/numerate"

export const dynamic = "force-dynamic"

type NumerateRequest = {
  source_image_id?: string
  superpixel_width?: number
  superpixel_height?: number
  stroke_width?: number
  show_colors?: boolean
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  return withFilterRouteAuth(req, projectId, async (req, context) => {
    const parsed = await readJson<NumerateRequest>(req, { stage: "validation" })
    if (!parsed.ok) return parsed.res
    const body = parsed.value ?? {}
    const sourceImageId = String(body.source_image_id ?? "")
    if (!isUuid(sourceImageId)) {
      return jsonError("Invalid source_image_id", 400, { stage: "validation", where: "body" })
    }

    const superpixelWidth = Number(body.superpixel_width ?? 10)
    const superpixelHeight = Number(body.superpixel_height ?? 10)
    const strokeWidth = Number(body.stroke_width ?? 2)
    const showColors = Boolean(body.show_colors ?? true)

    const result = await numerateImageAndActivate({
      supabase: context.supabase,
      projectId: context.projectId,
      sourceImageId,
      params: {
        superpixelWidth,
        superpixelHeight,
        strokeWidth,
        showColors,
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
      filterType: "numerate",
      filterParams: {
        superpixel_width: superpixelWidth,
        superpixel_height: superpixelHeight,
        stroke_width: strokeWidth,
        show_colors: showColors,
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
