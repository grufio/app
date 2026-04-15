import { NextResponse } from "next/server"

import { withProjectRouteAuth } from "@/lib/api/with-project-route-auth"
import { jsonError, readJson } from "@/lib/api/route-guards"
import { applyProjectImageFilter, listProjectImageFilters } from "@/services/editor/server/filter-variants"

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  return withProjectRouteAuth(req, projectId, async (_projectReq, context) => {
    const listed = await listProjectImageFilters({ supabase: context.supabase, projectId: context.projectId })
    if (!listed.ok) return jsonError(listed.reason, listed.status, { stage: listed.stage, code: listed.code })
    return NextResponse.json({ items: listed.items })
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  return withProjectRouteAuth(req, projectId, async (projectReq, context) => {
    const bodyParsed = await readJson<{ filter_type?: unknown; filter_params?: unknown }>(projectReq, { stage: "validation" })
    if (!bodyParsed.ok) return bodyParsed.res

    const applied = await applyProjectImageFilter({
      supabase: context.supabase,
      projectId: context.projectId,
      filterType: bodyParsed.value.filter_type,
      filterParams: bodyParsed.value.filter_params,
    })
    if (!applied.ok) return jsonError(applied.reason, applied.status, { stage: applied.stage, code: applied.code })
    return NextResponse.json({
      ok: true,
      item: applied.item,
      image_id: applied.image_id,
      width_px: applied.width_px,
      height_px: applied.height_px,
    })
  })
}

