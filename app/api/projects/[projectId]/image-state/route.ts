/**
 * API route: persisted image state (transform) for a project.
 *
 * Responsibilities:
 * - GET: read `project_image_state` for the master role or specific image.
 * - POST: validate and upsert µpx-based transform state.
 */
import { NextResponse } from "next/server"

import { jsonError, readJson, type ErrorPayload } from "@/lib/api/route-guards"
import { withProjectRouteAuth } from "@/lib/api/with-project-route-auth"
import { type IncomingImageStatePayload } from "@/lib/editor/imageState"
import { loadProjectImageState, saveProjectImageState } from "@/services/editor/server/image-state-route"

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const url = new URL(req.url)
  const queryImageId = url.searchParams.get("imageId")
  const { projectId } = await params
  return withProjectRouteAuth(req, projectId, async (_request, context) => {
    const result = await loadProjectImageState({
      supabase: context.supabase,
      projectId: context.projectId,
      queryImageId,
    })
    if (!result.ok) {
      return jsonError(result.reason, result.status, { stage: result.stage, code: result.code })
    }
    return NextResponse.json({ exists: result.exists, state: result.state })
  }) as Promise<NextResponse<{ exists: boolean; state: unknown } | ErrorPayload>>
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  return withProjectRouteAuth(req, projectId, async (request, context) => {
    const parsed = await readJson<IncomingImageStatePayload>(request, { stage: "validation" })
    if (!parsed.ok) return parsed.res
    const result = await saveProjectImageState({
      supabase: context.supabase,
      projectId: context.projectId,
      body: parsed.value,
    })
    if (!result.ok) {
      return jsonError(result.reason, result.status, {
        stage: result.stage,
        code: result.code,
        reason: result.code,
        where: result.where,
        ...(result.expectedImageId ? { expected_image_id: result.expectedImageId } : {}),
      })
    }
    return NextResponse.json({ ok: true })
  }) as Promise<NextResponse<{ ok: true } | ErrorPayload>>
}
