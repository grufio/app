/**
 * Server-side orchestration for master image uploads.
 *
 * Responsibilities:
 * - Validate upload constraints and normalize metadata.
 * - Upload file to storage, insert DB row, then activate state.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { activateMasterWithState } from "@/lib/supabase/project-images"
import type { Database } from "@/lib/supabase/database.types"

type UploadFailStage = "validation" | "upload_limits" | "storage_upload" | "db_upsert" | "active_switch" | "lock_conflict" | "storage_cleanup"

export type UploadMasterImageFailure = {
  ok: false
  status: number
  stage: UploadFailStage
  reason: string
  code?: string
  details?: Record<string, unknown>
}

export type UploadMasterImageSuccess = {
  ok: true
  id: string
  storagePath: string
}

export type UploadMasterImageResult = UploadMasterImageSuccess | UploadMasterImageFailure

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

function normalizePositiveInt(n: number): number | null {
  if (!Number.isFinite(n)) return null
  const v = Math.trunc(n)
  if (v <= 0) return null
  return v
}

function mapDbErrorStatus(error: { code?: string }): number {
  if (error.code === "23505") return 409
  if (error.code === "23503") return 409
  if (error.code === "23514") return 400
  return 500
}

async function cleanupUploadedObject(args: {
  supabase: SupabaseClient<Database>
  objectPath: string
}): Promise<{ ok: true } | { ok: false; reason: string; code?: string }> {
  const { supabase, objectPath } = args
  const { error } = await supabase.storage.from("project_images").remove([objectPath])
  if (error) {
    return {
      ok: false,
      reason: error.message,
      code: (error as unknown as { code?: string })?.code,
    }
  }
  return { ok: true }
}

export async function uploadMasterImage(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  file: File
  widthPx: number
  heightPx: number
  dpi?: number | null
  bitDepth?: number | null
  format: string
}): Promise<UploadMasterImageResult> {
  const { supabase, projectId, file, format } = args

  const widthPx = normalizePositiveInt(args.widthPx)
  const heightPx = normalizePositiveInt(args.heightPx)
  const dpi = args.dpi == null ? null : normalizePositiveInt(args.dpi)
  const bitDepth = args.bitDepth == null ? null : normalizePositiveInt(args.bitDepth)

  if (!widthPx || !heightPx) {
    return {
      ok: false,
      status: 400,
      stage: "validation",
      reason: "Missing/invalid width_px/height_px",
    }
  }

  const maxUploadBytes = parseOptionalPositiveInt(process.env.USER_MAX_UPLOAD_BYTES)
  if (maxUploadBytes != null && file.size > maxUploadBytes) {
    return {
      ok: false,
      status: 413,
      stage: "upload_limits",
      reason: "Upload too large",
      details: {
        max_bytes: maxUploadBytes,
        got_bytes: file.size,
      },
    }
  }

  const allowedMime = parseAllowedMimeList(process.env.USER_ALLOWED_UPLOAD_MIME)
  if (allowedMime != null) {
    const mime = (file.type || "").trim()
    if (!mime || !allowedMime.has(mime)) {
      return {
        ok: false,
        status: 415,
        stage: "upload_limits",
        reason: "Unsupported file type",
        details: {
          mime: mime || null,
          allowed_mime: Array.from(allowedMime),
        },
      }
    }
  }

  const maxPixels = parseOptionalPositiveInt(process.env.USER_UPLOAD_MAX_PIXELS)
  if (maxPixels != null) {
    const pixels = BigInt(widthPx) * BigInt(heightPx)
    if (pixels > BigInt(maxPixels)) {
      return {
        ok: false,
        status: 413,
        stage: "upload_limits",
        reason: "Image dimensions too large",
        details: {
          max_pixels: maxPixels,
          width_px: widthPx,
          height_px: heightPx,
        },
      }
    }
  }

  const imageId = crypto.randomUUID()
  const objectPath = `projects/${projectId}/images/${imageId}`

  const { error: uploadErr } = await supabase.storage.from("project_images").upload(objectPath, file, {
    upsert: true,
    contentType: file.type || undefined,
  })
  if (uploadErr) {
    return {
      ok: false,
      status: 502,
      stage: "storage_upload",
      reason: uploadErr.message,
      code: (uploadErr as unknown as { code?: string })?.code,
    }
  }

  const { error: dbErr } = await supabase.from("project_images").insert({
    id: imageId,
    project_id: projectId,
    role: "master",
    name: file.name,
    format,
    width_px: widthPx,
    height_px: heightPx,
    dpi,
    bit_depth: bitDepth,
    storage_bucket: "project_images",
    storage_path: objectPath,
    file_size_bytes: file.size,
    is_active: false,
  })
  if (dbErr) {
    const cleanup = await cleanupUploadedObject({ supabase, objectPath })
    return {
      ok: false,
      status: mapDbErrorStatus(dbErr as unknown as { code?: string }),
      stage: "db_upsert",
      reason: dbErr.message,
      code: (dbErr as unknown as { code?: string })?.code,
      ...(cleanup.ok
        ? {}
        : {
            details: {
              cleanup_error: cleanup.reason,
              cleanup_code: cleanup.code ?? null,
            },
          }),
    }
  }

  const activation = await activateMasterWithState({
    supabase,
    projectId,
    imageId,
    widthPx,
    heightPx,
  })
  if (!activation.ok) {
    const cleanup = await cleanupUploadedObject({ supabase, objectPath })
    return {
      ok: false,
      status: activation.stage === "lock_conflict" ? 409 : 500,
      stage: activation.stage,
      reason: activation.reason,
      code: activation.code,
      ...(cleanup.ok
        ? {}
        : {
            details: {
              cleanup_error: cleanup.reason,
              cleanup_code: cleanup.code ?? null,
            },
          }),
    }
  }

  return { ok: true, id: imageId, storagePath: objectPath }
}
