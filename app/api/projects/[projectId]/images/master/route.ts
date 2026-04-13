/**
 * API route: master image metadata and signed URL.
 *
 * Responsibilities:
 * - Return active image metadata and a short-lived signed URL for download.
 * - Support deletion of the active non-master image variant and all transitively derived images.
 */
import { NextResponse } from "next/server"

import { jsonError } from "@/lib/api/route-guards"
import { withProjectRouteAuth } from "@/lib/api/with-project-route-auth"
import { deleteActiveMasterVariant, getMasterImagePayload } from "@/services/editor/server/master-image-route"

export const dynamic = "force-dynamic"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  return withProjectRouteAuth(req, projectId, async (_request, context) => {
    const result = await getMasterImagePayload({
      supabase: context.supabase,
      projectId: context.projectId,
      userId: context.userId,
    })
    if (!result.ok) {
      return jsonError(result.reason, result.status, { stage: result.stage, code: result.code })
    }
    if (!result.exists) {
      return NextResponse.json({ exists: false })
    }
    return NextResponse.json(result.payload)
  })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  // DB delete() orchestration is delegated to service layer for route thinness.
  const { projectId } = await params
  return withProjectRouteAuth(req, projectId, async (_request, context) => {
    const result = await deleteActiveMasterVariant({
      supabase: context.supabase,
      projectId: context.projectId,
    })
    if (!result.ok) {
      return jsonError(result.reason, result.status, { stage: result.stage, code: result.code, ...(result.extra ?? {}) })
    }
    return NextResponse.json(result.payload)
  })
}
