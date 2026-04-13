/**
 * API route: restore active image to initial uploaded master.
 *
 * Responsibilities:
 * - Resolve the initial master image for the project (earliest role='master').
 * - Activate it and reset persisted image state in one DB operation.
 */
import { NextResponse } from "next/server"

import { jsonError } from "@/lib/api/route-guards"
import { withProjectRouteAuth } from "@/lib/api/with-project-route-auth"
import { restoreInitialMasterImage } from "@/services/editor/server/master-image-restore"

export const dynamic = "force-dynamic"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  return withProjectRouteAuth(req, projectId, async (_request, context) => {
    const result = await restoreInitialMasterImage(context.supabase, context.projectId)
    if (!result.ok) {
      return jsonError(result.reason, result.status, { stage: result.stage, code: result.code })
    }
    return NextResponse.json({ ok: true, image_id: result.imageId })
  })
}

