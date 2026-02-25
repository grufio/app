import { NextResponse } from "next/server"

import { isUuid, jsonError, readJson, requireUser } from "@/lib/api/route-guards"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { pixelateImageAndActivate } from "@/services/editor/server/pixelate-filter"

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
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })
  }

  const supabase = await createSupabaseServerClient()
  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  const { data: projectRow, error: projectErr } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle()
  if (projectErr) return jsonError("Failed to verify project access", 400, { stage: "project_access" })
  if (!projectRow?.id) return jsonError("Forbidden (project not accessible)", 403, { stage: "rls_denied", where: "project_access" })

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
    supabase,
    projectId,
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

  return NextResponse.json({
    ok: true,
    id: result.id,
    storage_path: result.storagePath,
    width_px: result.widthPx,
    height_px: result.heightPx,
  })
}
