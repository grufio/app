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

export const dynamic = "force-dynamic"

function sanitizeFilename(name: string): string {
  const base = typeof name === "string" && name.trim() ? name.trim() : "upload"
  // Keep Storage paths predictable and avoid control chars / path-like names.
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })
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
    console.warn("master upload: project access denied", { projectId, code: (projectErr as unknown as { code?: string })?.code })
    return jsonError("Forbidden (project not accessible)", 403, { stage: "rls_denied", where: "project_access" })
  }

  const form = await req.formData().catch(() => null)
  if (!form) {
    return jsonError("Invalid multipart form data", 400, { stage: "validation", where: "body" })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return jsonError("Missing file", 400, { stage: "validation", where: "validate" })
  }

  const width_px = Number(form.get("width_px"))
  const height_px = Number(form.get("height_px"))
  const format = String(form.get("format") ?? "unknown")

  if (!Number.isFinite(width_px) || !Number.isFinite(height_px)) {
    return jsonError("Missing/invalid width_px/height_px", 400, { stage: "validation", where: "validate" })
  }

  const objectPath = `projects/${projectId}/master/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`

  // Upload to Storage as the authenticated user (Storage RLS enforced).
  const { error: uploadErr } = await authed.storage.from("project_images").upload(objectPath, file, {
    upsert: true,
    contentType: file.type || undefined,
  })

  if (uploadErr) {
    console.warn("master upload: storage upload failed", { projectId, message: uploadErr.message })
    return jsonError(uploadErr.message, 400, { stage: "storage_policy", op: "upload" })
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
    console.warn("master upload: db upsert failed", { projectId, message: dbErr.message, code: (dbErr as unknown as { code?: string })?.code })
    return jsonError(dbErr.message, 400, {
      stage: "db_upsert",
      code: (dbErr as unknown as { code?: string })?.code,
    })
  }

  return NextResponse.json({ ok: true, storage_path: objectPath })
}

