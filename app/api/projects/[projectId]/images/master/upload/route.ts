/**
 * API route: upload master image.
 *
 * Responsibilities:
 * - Accept an upload request and store the file in Supabase Storage.
 * - Insert/update `project_images` metadata for the project master role.
 */
import { NextResponse } from "next/server"

import { withProjectRouteAuth } from "@/lib/api/with-project-route-auth"
import { jsonError } from "@/lib/api/route-guards"
import { uploadMasterImage } from "@/services/editor/server/master-image-upload"

export const dynamic = "force-dynamic"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  return withProjectRouteAuth(req, projectId, async (projectReq, context) => {
    const form = await projectReq.formData().catch(() => null)
    if (!form) {
      return jsonError("Invalid multipart form data", 400, { stage: "validation", where: "body" })
    }

    const file = form.get("file")
    if (!(file instanceof File)) {
      return jsonError("Missing file", 400, { stage: "validation", where: "validate" })
    }

    const width_px = Number(form.get("width_px"))
    const height_px = Number(form.get("height_px"))
    const dpiRaw = form.get("dpi")
    const bitDepthRaw = form.get("bit_depth")
    const format = String(form.get("format") ?? "unknown")

    if (!Number.isFinite(width_px) || !Number.isFinite(height_px)) {
      return jsonError("Missing/invalid dimensions", 400, { stage: "validation", where: "validate" })
    }
    const parsedDpi = Number(dpiRaw)
    const dpi = Number.isFinite(parsedDpi) && parsedDpi > 0 ? parsedDpi : null
    const parsedBitDepth = Number(bitDepthRaw)
    const bitDepth = Number.isFinite(parsedBitDepth) && parsedBitDepth > 0 ? parsedBitDepth : null

    const result = await uploadMasterImage({
      supabase: context.supabase,
      projectId: context.projectId,
      file,
      widthPx: width_px,
      heightPx: height_px,
      ...(dpi != null ? { dpi } : {}),
      ...(bitDepth != null ? { bitDepth } : {}),
      format,
    })
    if (!result.ok) {
      return jsonError(result.reason, result.status, {
        stage: result.stage,
        code: result.code,
        ...result.details,
      })
    }

    return NextResponse.json({ ok: true, id: result.id, storage_path: result.storagePath })
  })
}

