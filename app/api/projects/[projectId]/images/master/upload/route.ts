/**
 * API route: upload master image.
 *
 * Responsibilities:
 * - Accept an upload request and store the file in Supabase Storage.
 * - Insert/update `project_images` metadata for the project master role.
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseAuthedUserClient } from "@/lib/supabase/authed-user"
import { isUuid, jsonError, requireUser } from "@/lib/api/route-guards"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "params" })
  }
  const supabase = await createSupabaseServerClient()

  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const accessToken = session?.access_token

  if (!url || !anonKey || !accessToken) {
    return jsonError("Missing Supabase env or session token", 401, {
      stage: "auth_session",
      details: { hasUrl: Boolean(url), hasAnonKey: Boolean(anonKey), hasAccessToken: Boolean(accessToken) },
    })
  }

  // Explicit authed client for Storage + DB (ensures Authorization header is present for RLS).
  const authed = createSupabaseAuthedUserClient(accessToken)

  // Verify project is accessible under RLS (owner-only).
  const { data: projectRow, error: projectErr } = await authed
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single()

  if (projectErr || !projectRow) {
    return jsonError("Forbidden (project not accessible)", 403, { stage: "project_access", details: projectErr })
  }

  const form = await req.formData().catch(() => null)
  if (!form) {
    return jsonError("Invalid multipart form data", 400, { stage: "body" })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return jsonError("Missing file", 400, { stage: "validate" })
  }

  const width_px = Number(form.get("width_px"))
  const height_px = Number(form.get("height_px"))
  const format = String(form.get("format") ?? "unknown")

  if (!Number.isFinite(width_px) || !Number.isFinite(height_px)) {
    return jsonError("Missing/invalid width_px/height_px", 400, { stage: "validate" })
  }

  const objectPath = `projects/${projectId}/master/${crypto.randomUUID()}-${file.name}`

  // Upload to Storage as the authenticated user (Storage RLS enforced).
  const { error: uploadErr } = await authed.storage.from("project_images").upload(objectPath, file, {
    upsert: true,
    contentType: file.type || undefined,
  })

  if (uploadErr) {
    return jsonError(uploadErr.message, 400, { stage: "storage_upload", details: uploadErr })
  }

  // Upsert DB record for master image.
  const { error: dbErr } = await authed
    .from("project_images")
    .upsert(
      {
        project_id: projectId,
        role: "master",
        name: file.name,
        format,
        width_px,
        height_px,
        storage_path: objectPath,
        file_size_bytes: file.size,
      },
      { onConflict: "project_id,role" }
    )

  if (dbErr) {
    return jsonError(dbErr.message, 400, {
      stage: "db_upsert",
      code: (dbErr as unknown as { code?: string })?.code,
    })
  }

  return NextResponse.json({ ok: true, storage_path: objectPath })
}

