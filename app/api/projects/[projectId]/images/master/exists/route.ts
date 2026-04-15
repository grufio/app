/**
 * API route: master image existence check.
 *
 * Responsibilities:
 * - Return whether an active image exists for a project (owner-only via auth/RLS).
 */
import { NextResponse } from "next/server"

import { withProjectRouteAuth } from "@/lib/api/with-project-route-auth"
import { jsonError } from "@/lib/api/route-guards"

export const dynamic = "force-dynamic"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  return withProjectRouteAuth(req, projectId, async (_projectReq, context) => {
    const { data, error } = await context.supabase
      .from("project_images")
      .select("id")
      .eq("project_id", context.projectId)
      .eq("kind", "master")
      .is("deleted_at", null)
      .limit(1)

    if (error) {
      return jsonError(error.message, 400, { stage: "image_exists_query" })
    }

    return NextResponse.json({ exists: Array.isArray(data) ? data.length > 0 : false })
  })
}

