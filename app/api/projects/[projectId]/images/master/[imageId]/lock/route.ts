import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, jsonError, readJson, requireUser } from "@/lib/api/route-guards"

export const dynamic = "force-dynamic"

type LockBody = {
  is_locked?: boolean
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string; imageId: string }> }
) {
  const { projectId, imageId } = await params
  if (!isUuid(String(projectId)) || !isUuid(String(imageId))) {
    return jsonError("Invalid params", 400, { stage: "validation", where: "params" })
  }

  const parsed = await readJson<LockBody>(req, { stage: "validation" })
  if (!parsed.ok) return parsed.res
  if (typeof parsed.value?.is_locked !== "boolean") {
    return jsonError("Invalid body (is_locked:boolean required)", 400, { stage: "validation", where: "body" })
  }
  const isLocked = parsed.value.is_locked

  const supabase = await createSupabaseServerClient()
  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  // Explicit access check for clearer error staging (RLS still enforces owner-only).
  const { data: projectRow, error: projectErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle()
  if (projectErr) {
    return jsonError("Failed to verify project access", 400, { stage: "project_access" })
  }
  if (!projectRow?.id) {
    return jsonError("Forbidden (project not accessible)", 403, { stage: "rls_denied", where: "project_access" })
  }

  const { data: row, error: queryErr } = await supabase
    .from("project_images")
    .select("id")
    .eq("project_id", projectId)
    .eq("id", imageId)
    .eq("kind", "master")
    .is("deleted_at", null)
    .maybeSingle()
  if (queryErr) return jsonError(queryErr.message, 400, { stage: "lock_query" })
  if (!row?.id) return jsonError("Image not found", 404, { stage: "lock_query" })

  const { error: updateErr } = await supabase
    .from("project_images")
    .update({ is_locked: isLocked })
    .eq("project_id", projectId)
    .eq("id", imageId)
    .eq("kind", "master")
    .is("deleted_at", null)
  if (updateErr) return jsonError(updateErr.message, 400, { stage: "lock_update" })

  return NextResponse.json({ ok: true, id: imageId, is_locked: isLocked })
}

