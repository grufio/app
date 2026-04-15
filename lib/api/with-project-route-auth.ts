import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, jsonError, requireUser } from "./route-guards"

export type ProjectRouteContext = {
  supabase: SupabaseClient
  projectId: string
  userId: string
}

type RouteErrorPayload = {
  error: string
  stage: string
}

type ProjectRouteHandler<T = unknown> = (
  req: Request,
  context: ProjectRouteContext
) => Promise<NextResponse<T> | NextResponse<RouteErrorPayload>>

export async function withProjectRouteAuth<T = unknown>(
  req: Request,
  projectId: string,
  handler: ProjectRouteHandler<T>
): Promise<NextResponse<T> | NextResponse<RouteErrorPayload>> {
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })
  }

  const supabase = await createSupabaseServerClient()
  const auth = await requireUser(supabase)
  if (!auth.ok) return auth.res as NextResponse<RouteErrorPayload>

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

  return handler(req, {
    supabase,
    projectId,
    userId: auth.user.id,
  })
}
