import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { isUuid } from "@/lib/api/route-guards"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return NextResponse.json({ error: "Invalid projectId", stage: "params" }, { status: 400 })
  }
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const accessToken = session?.access_token

  if (!url || !anonKey || !accessToken) {
    return NextResponse.json(
      {
        error: "Missing Supabase env or session token",
        stage: "auth_session",
        details: {
          hasUrl: Boolean(url),
          hasAnonKey: Boolean(anonKey),
          hasAccessToken: Boolean(accessToken),
        },
      },
      { status: 401 }
    )
  }

  // Explicit authed client for Storage + DB (ensures Authorization header is present for RLS).
  const authed = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  // Verify project is accessible under RLS (owner-only).
  const { data: projectRow, error: projectErr } = await authed
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single()

  if (projectErr || !projectRow) {
    return NextResponse.json(
      { error: "Forbidden (project not accessible)", stage: "project_access", details: projectErr },
      { status: 403 }
    )
  }

  const form = await req.formData().catch(() => null)
  if (!form) {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 })
  }

  const width_px = Number(form.get("width_px"))
  const height_px = Number(form.get("height_px"))
  const format = String(form.get("format") ?? "unknown")

  if (!Number.isFinite(width_px) || !Number.isFinite(height_px)) {
    return NextResponse.json({ error: "Missing/invalid width_px/height_px" }, { status: 400 })
  }

  const objectPath = `projects/${projectId}/master/${crypto.randomUUID()}-${file.name}`

  // Upload to Storage as the authenticated user (Storage RLS enforced).
  const { error: uploadErr } = await authed.storage.from("project_images").upload(objectPath, file, {
    upsert: true,
    contentType: file.type || undefined,
  })

  if (uploadErr) {
    return NextResponse.json(
      { error: uploadErr.message, stage: "storage_upload", details: uploadErr },
      { status: 400 }
    )
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
    return NextResponse.json(
      { error: dbErr.message, stage: "db_upsert", code: (dbErr as unknown as { code?: string })?.code },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true, storage_path: objectPath })
}

