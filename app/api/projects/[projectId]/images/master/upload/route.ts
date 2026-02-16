/**
 * API route: upload master image.
 *
 * Responsibilities:
 * - Accept an upload request and store the file in Supabase Storage.
 * - Insert/update `project_images` metadata for the project master role.
 */
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { activateMasterWithState } from "@/lib/supabase/project-images"
import { isUuid, jsonError, requireUser } from "@/lib/api/route-guards"

export const dynamic = "force-dynamic"

function parseOptionalPositiveInt(value: string | undefined): number | null {
  if (typeof value !== "string" || !value.trim()) return null
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null
  return n
}

function parseAllowedMimeList(value: string | undefined): Set<string> | null {
  if (typeof value !== "string" || !value.trim()) return null
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (!items.length) return null
  return new Set(items)
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

  // Verify project is accessible under RLS (owner-only).
  const { data: projectRow, error: projectErr } = await supabase
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

  // MVP: safety rails are configured via env vars (not hard-coded).
  const maxUploadBytes = parseOptionalPositiveInt(process.env.USER_MAX_UPLOAD_BYTES)
  if (maxUploadBytes != null && file.size > maxUploadBytes) {
    return jsonError("Upload too large", 413, {
      stage: "upload_limits",
      max_bytes: maxUploadBytes,
      got_bytes: file.size,
    })
  }

  const allowedMime = parseAllowedMimeList(process.env.USER_ALLOWED_UPLOAD_MIME)
  if (allowedMime != null) {
    const mime = (file.type || "").trim()
    if (!mime || !allowedMime.has(mime)) {
      return jsonError("Unsupported file type", 415, {
        stage: "upload_limits",
        mime: mime || null,
        allowed_mime: Array.from(allowedMime),
      })
    }
  }

  const maxPixels = parseOptionalPositiveInt(process.env.USER_UPLOAD_MAX_PIXELS)
  if (maxPixels != null) {
    // Use BigInt to avoid overflow for large dimensions.
    const pixels = BigInt(Math.trunc(width_px)) * BigInt(Math.trunc(height_px))
    if (pixels > BigInt(maxPixels)) {
      return jsonError("Image dimensions too large", 413, {
        stage: "upload_limits",
        max_pixels: maxPixels,
        width_px,
        height_px,
      })
    }
  }

  const imageId = crypto.randomUUID()
  const objectPath = `projects/${projectId}/images/${imageId}`

  // Upload via server-only service role client (bypasses Storage RLS).
  // Ownership is enforced by the RLS-checked project lookup above.
  const service = createSupabaseServiceRoleClient()
  const { error: uploadErr } = await service.storage.from("project_images").upload(objectPath, file, {
    upsert: true,
    contentType: file.type || undefined,
  })

  if (uploadErr) {
    console.warn("master upload: storage upload failed", {
      projectId,
      message: uploadErr.message,
      code: (uploadErr as unknown as { code?: string })?.code,
      status: (uploadErr as unknown as { status?: number })?.status,
    })
    return jsonError(uploadErr.message, 400, {
      stage: "storage_upload",
      op: "upload",
      code: (uploadErr as unknown as { code?: string })?.code,
    })
  }

  // Upsert DB record for master image.
  const { error: dbErr } = await supabase
    .from("project_images")
    .insert({
      id: imageId,
      project_id: projectId,
      role: "master",
      name: file.name,
      format,
      width_px,
      height_px,
      storage_bucket: "project_images",
      storage_path: objectPath,
      file_size_bytes: file.size,
      is_active: false,
    })

  if (dbErr) {
    console.warn("master upload: db upsert failed", { projectId, message: dbErr.message, code: (dbErr as unknown as { code?: string })?.code })
    return jsonError(dbErr.message, 400, {
      stage: "db_upsert",
      code: (dbErr as unknown as { code?: string })?.code,
    })
  }

  const activation = await activateMasterWithState({
    supabase,
    projectId,
    imageId,
    widthPx: width_px,
    heightPx: height_px,
  })
  if (!activation.ok) {
    console.warn("master upload: active switch failed", { projectId, message: activation.reason })
    return jsonError(activation.reason, 400, {
      stage: "active_switch",
      code: activation.code,
    })
  }

  return NextResponse.json({ ok: true, id: imageId, storage_path: objectPath })
}

