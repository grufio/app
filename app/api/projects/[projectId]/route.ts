/**
 * API route: project resource operations.
 *
 * Responsibilities:
 * - Handle project deletion (owner-only via auth/RLS).
 */
import { NextResponse } from "next/server"

import { withProjectRouteAuth } from "@/lib/api/with-project-route-auth"
import { jsonError } from "@/lib/api/route-guards"

export const dynamic = "force-dynamic"

export async function DELETE(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  return withProjectRouteAuth(_req, projectId, async (_projectReq, context) => {
    const { data, error } = await context.supabase
      .from("projects")
      .delete()
      .eq("id", context.projectId)
      .select("id")
      .maybeSingle()

    if (error) return jsonError(error.message, 400, { stage: "delete_project" })
    if (!data?.id) return jsonError("Not found", 404, { stage: "delete_project" })

    return NextResponse.json({ ok: true })
  })
}

