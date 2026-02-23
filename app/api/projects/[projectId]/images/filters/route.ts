import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, jsonError, readJson, requireUser } from "@/lib/api/route-guards"
import { applyProjectImageFilter, listProjectImageFilters } from "@/services/editor/server/filter-variants"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })
  }
  const supabase = await createSupabaseServerClient()
  const user = await requireUser(supabase)
  if (!user.ok) return user.res

  const { data: projectRow, error: projectErr } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle()
  if (projectErr) return jsonError("Failed to verify project access", 400, { stage: "project_access" })
  if (!projectRow?.id) return jsonError("Forbidden (project not accessible)", 403, { stage: "rls_denied", where: "project_access" })

  const listed = await listProjectImageFilters({ supabase, projectId })
  if (!listed.ok) return jsonError(listed.reason, listed.status, { stage: listed.stage, code: listed.code })
  return NextResponse.json({ items: listed.items })
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })
  }
  const supabase = await createSupabaseServerClient()
  const user = await requireUser(supabase)
  if (!user.ok) return user.res

  const { data: projectRow, error: projectErr } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle()
  if (projectErr) return jsonError("Failed to verify project access", 400, { stage: "project_access" })
  if (!projectRow?.id) return jsonError("Forbidden (project not accessible)", 403, { stage: "rls_denied", where: "project_access" })

  const bodyParsed = await readJson<{ filter_type?: unknown; filter_params?: unknown }>(req, { stage: "validation" })
  if (!bodyParsed.ok) return bodyParsed.res

  const applied = await applyProjectImageFilter({
    supabase,
    projectId,
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
}

