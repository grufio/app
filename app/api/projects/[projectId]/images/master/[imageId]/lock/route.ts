import { NextResponse } from "next/server"

import { withProjectRouteAuth } from "@/lib/api/with-project-route-auth"
import { isUuid, jsonError, readJson } from "@/lib/api/route-guards"

export const dynamic = "force-dynamic"

type LockBody = {
  is_locked?: boolean
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string; imageId: string }> }
) {
  const { projectId, imageId } = await params
  if (!isUuid(String(imageId))) {
    return jsonError("Invalid params", 400, { stage: "validation", where: "params" })
  }

  const parsed = await readJson<LockBody>(req, { stage: "validation" })
  if (!parsed.ok) return parsed.res
  if (typeof parsed.value?.is_locked !== "boolean") {
    return jsonError("Invalid body (is_locked:boolean required)", 400, { stage: "validation", where: "body" })
  }
  const isLocked = parsed.value.is_locked

  return withProjectRouteAuth(req, projectId, async (_projectReq, context) => {
    const { data: row, error: queryErr } = await context.supabase
      .from("project_images")
      .select("id")
      .eq("project_id", context.projectId)
      .eq("id", imageId)
      .eq("kind", "master")
      .is("deleted_at", null)
      .maybeSingle()
    if (queryErr) return jsonError(queryErr.message, 400, { stage: "lock_query" })
    if (!row?.id) return jsonError("Image not found", 404, { stage: "lock_query" })

    const { error: updateErr } = await context.supabase
      .from("project_images")
      .update({ is_locked: isLocked })
      .eq("project_id", context.projectId)
      .eq("id", imageId)
      .eq("kind", "master")
      .is("deleted_at", null)
    if (updateErr) return jsonError(updateErr.message, 400, { stage: "lock_update" })

    return NextResponse.json({ ok: true, id: imageId, is_locked: isLocked })
  })
}

