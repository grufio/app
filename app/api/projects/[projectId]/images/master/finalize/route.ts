/**
 * API route: finalize a master image upload.
 *
 * The client uploads the raw file bytes DIRECTLY to Supabase Storage (owner-only
 * RLS authorizes the write), then calls this JSON endpoint with the object's
 * `imageId`. The server downloads that object, runs the EXIF-normalise →
 * validate → insert → activate pipeline, and returns the signed master
 * snapshot. No file body passes through the function, so the ~4.5 MB serverless
 * request-body limit no longer caps upload size.
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, jsonError, readJson, requireUser } from "@/lib/api/route-guards"
import { finalizeMasterImageUpload } from "@/services/editor/server/master-image-upload"

export const dynamic = "force-dynamic"
// Download + 3 sharp passes + re-upload of an up-to-50MB image can exceed the
// default 10s function budget.
export const maxDuration = 60

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    if (!isUuid(String(projectId))) {
      return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })
    }

    const body = await readJson<{ imageId?: unknown; fileName?: unknown; format?: unknown }>(req, {
      stage: "validation",
    })
    if (!body.ok) return body.res
    const imageId = String(body.value.imageId ?? "")
    if (!isUuid(imageId)) {
      // Mandatory: keeps the storage path inside this project (no traversal).
      return jsonError("Invalid imageId", 400, { stage: "validation", where: "body" })
    }
    const fileName = typeof body.value.fileName === "string" ? body.value.fileName : "master image"
    const format = typeof body.value.format === "string" ? body.value.format : "unknown"

    const supabase = await createSupabaseServerClient()

    const u = await requireUser(supabase)
    if (!u.ok) return u.res

    // Verify project is accessible under RLS (owner-only).
    const { data: projectRow, error: projectErr } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .single()
    if (projectErr || !projectRow) {
      return jsonError("Forbidden (project not accessible)", 403, {
        stage: "rls_denied",
        where: "project_access",
      })
    }

    const result = await finalizeMasterImageUpload({ supabase, projectId, imageId, fileName, format })
    if (!result.ok) {
      return jsonError(result.reason, result.status, {
        stage: result.stage,
        code: result.code,
        ...result.details,
      })
    }

    return NextResponse.json({
      ok: true,
      id: result.id,
      storage_path: result.storagePath,
      master: result.master,
    })
  } catch (err) {
    // Any unexpected throw returns JSON (not an HTML 500 page) so the client
    // surfaces the real reason instead of "No JSON error body returned".
    return jsonError(err instanceof Error ? err.message : "Unexpected upload-finalize error", 500, {
      stage: "unexpected",
    })
  }
}
