/**
 * API route: master image metadata and signed URL.
 *
 * Responsibilities:
 * - Return master image metadata and a short-lived signed URL for download.
 * - Support deletion of the master image (and associated state) via Supabase.
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isUuid, jsonError, requireUser } from "@/lib/api/route-guards"

export const dynamic = "force-dynamic"

// Best-effort in-memory cache to reduce Storage signed URL churn.
// This is per server process (works well in dev / long-lived runtimes).
const signedUrlCache = new Map<string, { url: string; expiresAtMs: number }>()
const SIGNED_URL_CACHE_MAX_ENTRIES = 500
const SIGNED_URL_TTL_S = 60 * 10
const SIGNED_URL_RENEW_BUFFER_MS = 60_000

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })
  }
  const supabase = await createSupabaseServerClient()

  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  const { data: img, error: imgErr } = await supabase
    .from("project_images")
    .select("id,storage_path,storage_bucket,name,format,width_px,height_px,dpi,file_size_bytes,is_active")
    .eq("project_id", projectId)
    .eq("role", "master")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle()

  if (imgErr) {
    return jsonError(imgErr.message, 400, { stage: "image_query" })
  }

  if (!img?.storage_path) {
    return NextResponse.json({ exists: false })
  }
  const dpiRaw = Number(img.dpi)
  const dpi = Number.isFinite(dpiRaw) && dpiRaw > 0 ? Math.round(dpiRaw) : null
  if (!dpi) {
    return jsonError("Invalid master image metadata: dpi", 500, { stage: "image_query", where: "dpi" })
  }

  const now = Date.now()
  // Signed URLs are bearer tokens; the cache must be user-scoped.
  const bucket = img.storage_bucket ?? "project_images"
  const cacheKey = `${u.user.id}:${bucket}:${img.storage_path}`
  const cached = signedUrlCache.get(cacheKey)
  if (cached && cached.expiresAtMs - SIGNED_URL_RENEW_BUFFER_MS > now) {
    // LRU: refresh recency on hit.
    signedUrlCache.delete(cacheKey)
    signedUrlCache.set(cacheKey, cached)
    return NextResponse.json({
      exists: true,
      id: img.id,
      signedUrl: cached.url,
      storage_path: img.storage_path,
      name: img.name,
      format: img.format,
      width_px: img.width_px,
      height_px: img.height_px,
      dpi,
      file_size_bytes: img.file_size_bytes,
    })
  }

  const { data: signed, error: signedErr } = await supabase.storage.from(bucket).createSignedUrl(img.storage_path, SIGNED_URL_TTL_S)

  if (signedErr || !signed?.signedUrl) {
    return jsonError(signedErr?.message ?? "Failed to create signed URL", 400, { stage: "storage_policy", op: "createSignedUrl" })
  }

  signedUrlCache.set(cacheKey, { url: signed.signedUrl, expiresAtMs: now + SIGNED_URL_TTL_S * 1000 })
  // Prevent unbounded growth in long-lived runtimes.
  if (signedUrlCache.size > SIGNED_URL_CACHE_MAX_ENTRIES) {
    const firstKey = signedUrlCache.keys().next().value as string | undefined
    if (firstKey) signedUrlCache.delete(firstKey)
  }

  return NextResponse.json({
    exists: true,
    id: img.id,
    signedUrl: signed.signedUrl,
    storage_path: img.storage_path,
    name: img.name,
    format: img.format,
    width_px: img.width_px,
    height_px: img.height_px,
    dpi,
    file_size_bytes: img.file_size_bytes,
  })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" })
  }
  const supabase = await createSupabaseServerClient()

  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  const { data: img, error: imgErr } = await supabase
    .from("project_images")
    .select("id,storage_path,is_active")
    .eq("project_id", projectId)
    .eq("role", "master")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle()

  if (imgErr) {
    return jsonError(imgErr.message, 400, { stage: "image_query" })
  }

  if (!img?.storage_path) {
    return NextResponse.json({ ok: true, deleted: false })
  }

  const { error: rmErr } = await supabase.storage.from("project_images").remove([img.storage_path])
  if (rmErr) {
    return jsonError(rmErr.message, 400, { stage: "storage_policy", op: "remove", storage_path: img.storage_path })
  }

  const { error: delErr } = await supabase.from("project_images").delete().eq("id", img.id)

  if (delErr) {
    return jsonError(delErr.message, 400, { stage: "db_delete" })
  }

  const { error: activeErr } = await supabase.rpc("set_active_master_latest", {
    p_project_id: projectId,
  })
  if (activeErr) {
    return jsonError(activeErr.message, 400, { stage: "active_switch" })
  }

  return NextResponse.json({ ok: true, deleted: true })
}
