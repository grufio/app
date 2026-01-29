/**
 * API route: master image metadata and signed URL.
 *
 * Responsibilities:
 * - Return master image metadata and a short-lived signed URL for download.
 * - Support deletion of the master image (and associated state) via Supabase.
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, jsonError, readJson, requireUser } from "@/lib/api/route-guards"

type Body = {
  storage_path: string
  name: string
  format: string
  width_px: number
  height_px: number
  file_size_bytes: number
}

// Best-effort in-memory cache to reduce Storage signed URL churn.
// This is per server process (works well in dev / long-lived runtimes).
const signedUrlCache = new Map<string, { url: string; expiresAtMs: number }>()
const SIGNED_URL_TTL_S = 60 * 10
const SIGNED_URL_RENEW_BUFFER_MS = 60_000

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "params" })
  }
  const supabase = await createSupabaseServerClient()

  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  const { data: img, error: imgErr } = await supabase
    .from("project_images")
    .select("storage_path,name,format,width_px,height_px,file_size_bytes")
    .eq("project_id", projectId)
    .eq("role", "master")
    .maybeSingle()

  if (imgErr) {
    return jsonError(imgErr.message, 400, { stage: "image_query" })
  }

  if (!img?.storage_path) {
    return NextResponse.json({ exists: false })
  }

  const now = Date.now()
  const cached = signedUrlCache.get(img.storage_path)
  if (cached && cached.expiresAtMs - SIGNED_URL_RENEW_BUFFER_MS > now) {
    return NextResponse.json({
      exists: true,
      signedUrl: cached.url,
      storage_path: img.storage_path,
      name: img.name,
      format: img.format,
      width_px: img.width_px,
      height_px: img.height_px,
      file_size_bytes: img.file_size_bytes,
    })
  }

  const { data: signed, error: signedErr } = await supabase.storage
    .from("project_images")
    .createSignedUrl(img.storage_path, SIGNED_URL_TTL_S)

  if (signedErr || !signed?.signedUrl) {
    return jsonError(signedErr?.message ?? "Failed to create signed URL", 400, { stage: "signed_url" })
  }

  signedUrlCache.set(img.storage_path, { url: signed.signedUrl, expiresAtMs: now + SIGNED_URL_TTL_S * 1000 })

  return NextResponse.json({
    exists: true,
    signedUrl: signed.signedUrl,
    storage_path: img.storage_path,
    name: img.name,
    format: img.format,
    width_px: img.width_px,
    height_px: img.height_px,
    file_size_bytes: img.file_size_bytes,
  })
}

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

  const parsed = await readJson<Body>(req, { stage: "body" })
  if (!parsed.ok) return parsed.res
  const body = parsed.value

  if (
    !body?.storage_path ||
    !body?.name ||
    !body?.format ||
    !Number.isFinite(body.width_px) ||
    !Number.isFinite(body.height_px) ||
    !Number.isFinite(body.file_size_bytes)
  ) {
    return jsonError("Missing/invalid fields", 400, { stage: "validate" })
  }

  // Upsert master image row; RLS enforces owner-only via projects.owner_id = auth.uid().
  const { error } = await supabase
    .from("project_images")
    .upsert(
      {
        project_id: projectId,
        role: "master",
        name: body.name,
        format: body.format,
        width_px: body.width_px,
        height_px: body.height_px,
        storage_path: body.storage_path,
        file_size_bytes: body.file_size_bytes,
      },
      { onConflict: "project_id,role" }
    )

  if (error) {
    return jsonError(error.message, 400, {
      stage: "upsert",
      code: (error as unknown as { code?: string })?.code,
      hint: (error as unknown as { hint?: string })?.hint,
      details: { project_id: projectId, user_id: u.user.id },
    })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "params" })
  }
  const supabase = await createSupabaseServerClient()

  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  const { data: img, error: imgErr } = await supabase
    .from("project_images")
    .select("storage_path")
    .eq("project_id", projectId)
    .eq("role", "master")
    .maybeSingle()

  if (imgErr) {
    return jsonError(imgErr.message, 400, { stage: "image_query" })
  }

  if (!img?.storage_path) {
    return NextResponse.json({ ok: true, deleted: false })
  }

  const { error: rmErr } = await supabase.storage.from("project_images").remove([img.storage_path])
  if (rmErr) {
    return jsonError(rmErr.message, 400, { stage: "storage_remove", storage_path: img.storage_path })
  }

  const { error: delErr } = await supabase
    .from("project_images")
    .delete()
    .eq("project_id", projectId)
    .eq("role", "master")

  if (delErr) {
    return jsonError(delErr.message, 400, { stage: "db_delete" })
  }

  return NextResponse.json({ ok: true, deleted: true })
}
