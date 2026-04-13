import type { SupabaseClient } from "@supabase/supabase-js"

import { evaluateDeleteTarget } from "@/services/editor/server/delete-target-policy"
import { resolveImageKind } from "@/services/editor/server/image-kind"

const signedUrlCache = new Map<string, { url: string; expiresAtMs: number }>()
const SIGNED_URL_CACHE_MAX_ENTRIES = 500
const SIGNED_URL_TTL_S = 60 * 10
const SIGNED_URL_RENEW_BUFFER_MS = 60_000

export type MasterImageGetResult =
  | {
      ok: true
      exists: false
    }
  | {
      ok: true
      exists: true
      payload: {
        exists: true
        id: string
        signedUrl: string
        storage_path: string
        name: string
        format: string
        width_px: number
        height_px: number
        dpi: number | null
        file_size_bytes: number
        restore_base: {
          id: string
          width_px: number
          height_px: number
          dpi: number | null
        } | null
      }
    }
  | {
      ok: false
      status: number
      stage: string
      reason: string
      code?: string
    }

export async function getMasterImagePayload(args: {
  supabase: SupabaseClient
  projectId: string
  userId: string
}): Promise<MasterImageGetResult> {
  const { supabase, projectId, userId } = args
  const { data: img, error: imgErr } = await supabase
    .from("project_images")
    .select("id,storage_path,storage_bucket,name,format,width_px,height_px,dpi,file_size_bytes,is_active")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle()
  if (imgErr) {
    return { ok: false, status: 400, stage: "image_query", reason: imgErr.message, code: imgErr.code }
  }
  if (!img?.storage_path) return { ok: true, exists: false }

  const { data: restoreBase, error: restoreBaseErr } = await supabase
    .from("project_images")
    .select("id,width_px,height_px,dpi")
    .eq("project_id", projectId)
    .eq("kind", "master")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (restoreBaseErr) {
    return { ok: false, status: 400, stage: "restore_base_query", reason: restoreBaseErr.message, code: restoreBaseErr.code }
  }

  const restoreBasePayload =
    restoreBase && Number(restoreBase.width_px) > 0 && Number(restoreBase.height_px) > 0
      ? {
          id: String(restoreBase.id),
          width_px: Number(restoreBase.width_px),
          height_px: Number(restoreBase.height_px),
          dpi: restoreBase.dpi == null ? null : Number(restoreBase.dpi),
        }
      : null
  const dpiRaw = Number(img.dpi)
  const dpi = Number.isFinite(dpiRaw) && dpiRaw > 0 ? Math.round(dpiRaw) : null

  const now = Date.now()
  const bucket = img.storage_bucket ?? "project_images"
  const cacheKey = `${userId}:${bucket}:${img.storage_path}`
  const cached = signedUrlCache.get(cacheKey)
  if (cached && cached.expiresAtMs - SIGNED_URL_RENEW_BUFFER_MS > now) {
    signedUrlCache.delete(cacheKey)
    signedUrlCache.set(cacheKey, cached)
    return {
      ok: true,
      exists: true,
      payload: {
        exists: true,
        id: String(img.id),
        signedUrl: cached.url,
        storage_path: String(img.storage_path),
        name: String(img.name ?? ""),
        format: String(img.format ?? ""),
        width_px: Number(img.width_px ?? 0),
        height_px: Number(img.height_px ?? 0),
        dpi,
        file_size_bytes: Number(img.file_size_bytes ?? 0),
        restore_base: restoreBasePayload,
      },
    }
  }

  const { data: signed, error: signedErr } = await supabase.storage.from(bucket).createSignedUrl(img.storage_path, SIGNED_URL_TTL_S)
  if (signedErr || !signed?.signedUrl) {
    return {
      ok: false,
      status: 400,
      stage: "storage_policy",
      reason: signedErr?.message ?? "Failed to create signed URL",
    }
  }

  signedUrlCache.set(cacheKey, { url: signed.signedUrl, expiresAtMs: now + SIGNED_URL_TTL_S * 1000 })
  if (signedUrlCache.size > SIGNED_URL_CACHE_MAX_ENTRIES) {
    const firstKey = signedUrlCache.keys().next().value as string | undefined
    if (firstKey) signedUrlCache.delete(firstKey)
  }

  return {
    ok: true,
    exists: true,
    payload: {
      exists: true,
      id: String(img.id),
      signedUrl: signed.signedUrl,
      storage_path: String(img.storage_path),
      name: String(img.name ?? ""),
      format: String(img.format ?? ""),
      width_px: Number(img.width_px ?? 0),
      height_px: Number(img.height_px ?? 0),
      dpi,
      file_size_bytes: Number(img.file_size_bytes ?? 0),
      restore_base: restoreBasePayload,
    },
  }
}

export type MasterImageDeleteResult =
  | {
      ok: true
      payload: {
        ok: true
        deleted: number
        transitiveCount: number
        stage: "fallback_applied" | "no_working_copy" | "delete_ok" | "storage_cleanup_incomplete"
        fallback_target: { image_id: string; kind: "working_copy" } | null
        storage_cleanup_failures: Array<{ bucket: string; error: string }>
      }
    }
  | {
      ok: false
      status: number
      stage: string
      reason: string
      code?: string
      extra?: Record<string, unknown>
    }

export async function deleteActiveMasterVariant(args: {
  supabase: SupabaseClient
  projectId: string
}): Promise<MasterImageDeleteResult> {
  const { supabase, projectId } = args
  const { data: imageToDelete, error: fetchErr } = await supabase
    .from("project_images")
    .select("id,storage_path,storage_bucket,is_active,is_locked,role,kind,source_image_id,name")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle()
  if (fetchErr) return { ok: false, status: 400, stage: "fetch_image", reason: "Failed to fetch image" }
  if (!imageToDelete) return { ok: false, status: 404, stage: "not_found", reason: "Image not found" }

  const policy = evaluateDeleteTarget({
    targetImageId: imageToDelete.id ? String(imageToDelete.id) : null,
    targetKind: resolveImageKind(imageToDelete),
  })
  if (!policy.deletable) {
    if (policy.delete_reason === "master_immutable") {
      return { ok: false, status: 409, stage: "master_immutable", reason: "Master image is immutable. Use restore/replace flow." }
    }
    if (policy.delete_reason === "image_locked") {
      return { ok: false, status: 409, stage: "lock_conflict", reason: "Active image is locked", code: "image_locked" }
    }
    return { ok: false, status: 409, stage: "stale_selection", reason: "No active image available for delete" }
  }

  const imageId = imageToDelete.id
  const { data: targetsRaw, error: targetsErr } = await supabase.rpc("collect_project_image_delete_targets", {
    p_project_id: projectId,
    p_root_image_id: imageId,
  })
  if (targetsErr) {
    return {
      ok: false,
      status: 500,
      stage: "delete_targets",
      reason: "Failed to resolve transitive delete targets",
      code: (targetsErr as unknown as { code?: string })?.code,
      extra: { error: targetsErr.message },
    }
  }

  const deleteTargets = Array.isArray(targetsRaw)
    ? (targetsRaw as Array<{ id: string; storage_bucket: string | null; storage_path: string | null }>)
    : []
  const wasActive = imageToDelete.is_active

  const { error: deleteErr } = await supabase
    .from("project_images")
    .delete()
    .eq("id", imageId)
    .eq("project_id", projectId)
    .neq("kind", "master")
  if (deleteErr) {
    return { ok: false, status: 500, stage: "db_delete", reason: "Failed to delete image", extra: { error: deleteErr.message } }
  }

  const storageCleanupFailures: Array<{ bucket: string; error: string }> = []
  if (deleteTargets.length > 0) {
    const storageByBucket = new Map<string, string[]>()
    const defaultBucket = "project_images"
    for (const target of deleteTargets) {
      if (!target.storage_path) continue
      const bucket = target.storage_bucket ?? defaultBucket
      const existing = storageByBucket.get(bucket)
      if (existing) existing.push(target.storage_path)
      else storageByBucket.set(bucket, [target.storage_path])
    }
    for (const [bucket, paths] of storageByBucket) {
      if (!paths.length) continue
      const { error: removeErr } = await supabase.storage.from(bucket).remove(paths)
      if (removeErr) storageCleanupFailures.push({ bucket, error: removeErr.message })
    }
  }

  let fallbackTarget: { image_id: string; kind: "working_copy" } | null = null
  let fallbackStage: "fallback_applied" | "no_working_copy" | "delete_ok" | "storage_cleanup_incomplete" = "delete_ok"
  if (storageCleanupFailures.length > 0) fallbackStage = "storage_cleanup_incomplete"

  if (wasActive) {
    const { data: remainingImages } = await supabase
      .from("project_images")
      .select("id,role,kind,source_image_id,name")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })

    const working = (remainingImages ?? []).find((row) => resolveImageKind(row) === "working_copy")
    if (working) {
      const kind = resolveImageKind(working)
      await supabase.from("project_images").update({ is_active: true }).eq("id", working.id)
      fallbackTarget = kind === "working_copy" ? { image_id: String(working.id), kind: "working_copy" } : null
      fallbackStage = fallbackTarget ? "fallback_applied" : "delete_ok"
    } else {
      fallbackStage = "no_working_copy"
    }
  }

  return {
    ok: true,
    payload: {
      ok: true,
      deleted: 1,
      transitiveCount: Math.max(0, deleteTargets.length - 1),
      stage: fallbackStage,
      fallback_target: fallbackTarget,
      storage_cleanup_failures: storageCleanupFailures,
    },
  }
}
