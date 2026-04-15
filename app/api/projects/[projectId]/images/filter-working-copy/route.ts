import { NextResponse } from "next/server"

import { withProjectRouteAuth } from "@/lib/api/with-project-route-auth"
import { jsonError } from "@/lib/api/route-guards"
import { getFilterPanelData } from "@/services/editor/server/filter-working-copy"

export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  return withProjectRouteAuth(req, projectId, async (_projectReq, context) => {
    const result = await getFilterPanelData({ supabase: context.supabase, projectId: context.projectId })

    if (!result.ok) {
      if (result.stage === "no_active_image") {
        return NextResponse.json({ ok: true, exists: false, stage: "no_active_image" })
      }
      return jsonError(result.reason, result.status, { stage: result.stage, code: result.code })
    }

    return NextResponse.json({
      ok: true,
      exists: true,
      id: result.display.id,
      storage_path: result.display.storagePath,
      width_px: result.display.widthPx,
      height_px: result.display.heightPx,
      signed_url: result.display.signedUrl,
      source_image_id: result.display.sourceImageId,
      name: result.display.name,
      is_filter_result: result.display.isFilterResult,
      stack: result.stack,
    })
  })
}
