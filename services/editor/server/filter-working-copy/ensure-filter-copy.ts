/**
 * Lazy filter_working_copy creation — runs only when the first
 * filter actually needs a source row. Mirrors the lazy
 * working_copy pattern (`services/editor/server/working-copy/ensure.ts`):
 * server-side `storage.copy()` from the source row, no bytes
 * through the Node process.
 *
 * Caller contract: pass the source row (typically `working_copy`).
 * The helper deduplicates by checking for an existing
 * `filter_working_copy` whose `source_image_id` matches and whose
 * name follows the canonical pattern; on a match it returns the
 * existing row with a fresh signed URL instead of materialising
 * a redundant copy. This makes the helper safe to call before
 * every filter apply.
 */
import crypto from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"
import { SIGNED_URL_TTL } from "@/lib/storage/signed-url-ttl"
import { resetProjectFilterChain } from "@/services/editor/server/filter-chain-reset"

import { softDeleteCopies } from "./soft-delete-copies"

export type EnsureFilterWorkingCopyResult =
  | {
      ok: true
      id: string
      storagePath: string
      widthPx: number
      heightPx: number
      signedUrl: string
      sourceImageId: string
      name: string
      created: boolean
    }
  | {
      ok: false
      status: number
      stage: "working_copy_exists" | "soft_delete" | "storage_copy" | "db_insert"
      reason: string
      code?: string
    }

function readPgCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code
    return typeof code === "string" ? code : undefined
  }
  return undefined
}

export async function ensureFilterWorkingCopyExists(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  source: {
    id: string
    storage_bucket: string | null
    storage_path: string
    name: string
    format: string
    width_px: number
    height_px: number
    file_size_bytes: number
  }
}): Promise<EnsureFilterWorkingCopyResult> {
  const { supabase, projectId, source } = args
  const workingCopyName = `${source.name} (filter working)`

  // Step 1 — look up existing filter_working_copy candidates for this
  // project. Use the same query shape `getFilterPanelData` uses so the
  // deduplication is consistent.
  const { data: existingCopies, error: existingErr } = await supabase
    .from("project_images")
    .select("id,storage_bucket,storage_path,width_px,height_px,source_image_id,name,updated_at,created_at")
    .eq("project_id", projectId)
    .eq("kind", "filter_working_copy")
    .like("name", "%(filter working)")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20)

  if (existingErr) {
    return {
      ok: false,
      status: 400,
      stage: "working_copy_exists",
      reason: existingErr.message,
      code: readPgCode(existingErr),
    }
  }

  const reusable = (existingCopies ?? []).find(
    (copy) => copy.source_image_id === source.id && copy.name === workingCopyName,
  )

  if (reusable) {
    // Tombstone other matching candidates so we never accumulate
    // duplicates. The filter chain might still reference them via
    // input/output ids, so reset the chain first when there are
    // obsolete rows to remove.
    const obsoleteIds = (existingCopies ?? [])
      .filter((copy) => copy.id !== reusable.id)
      .map((copy) => copy.id)
    if (obsoleteIds.length > 0) {
      const reset = await resetProjectFilterChain({ supabase, projectId })
      if (!reset.ok) {
        return { ok: false, status: 500, stage: "soft_delete", reason: reset.reason, code: reset.code }
      }
    }
    const softDelete = await softDeleteCopies(supabase, obsoleteIds)
    if (!softDelete.ok) {
      return {
        ok: false,
        status: 500,
        stage: "soft_delete",
        reason: softDelete.reason,
        code: softDelete.code,
      }
    }

    const { data: signedData } = await supabase.storage
      .from(String(reusable.storage_bucket ?? PROJECT_IMAGES_BUCKET))
      .createSignedUrl(String(reusable.storage_path), SIGNED_URL_TTL.filterWorkingCopy)

    return {
      ok: true,
      id: String(reusable.id),
      storagePath: String(reusable.storage_path),
      widthPx: Number(reusable.width_px),
      heightPx: Number(reusable.height_px),
      signedUrl: signedData?.signedUrl ?? "",
      sourceImageId: source.id,
      name: source.name,
      created: false,
    }
  }

  // Step 2 — no reusable copy. Clear any stale ones and the chain
  // that may have pointed at them.
  const reset = await resetProjectFilterChain({ supabase, projectId })
  if (!reset.ok) {
    return { ok: false, status: 500, stage: "soft_delete", reason: reset.reason, code: reset.code }
  }
  const softDelete = await softDeleteCopies(
    supabase,
    (existingCopies ?? []).map((copy) => copy.id),
  )
  if (!softDelete.ok) {
    return {
      ok: false,
      status: 500,
      stage: "soft_delete",
      reason: softDelete.reason,
      code: softDelete.code,
    }
  }

  // Step 3 — server-side storage.copy from source to new
  // filter_working_copy path. No bytes through the Node process.
  const newId = crypto.randomUUID()
  const targetPath = `projects/${projectId}/images/${newId}`
  const sourceBucket = String(source.storage_bucket ?? PROJECT_IMAGES_BUCKET)

  const copyResult = await supabase.storage.from(sourceBucket).copy(source.storage_path, targetPath, {
    destinationBucket: PROJECT_IMAGES_BUCKET,
  })
  const copyErr = (copyResult as { error?: { message?: string; code?: string } } | null | undefined)?.error
  if (copyErr) {
    return {
      ok: false,
      status: 500,
      stage: "storage_copy",
      reason: copyErr.message ?? "Failed to copy source to filter_working_copy",
      code: (copyErr as { code?: string }).code,
    }
  }

  // Step 4 — insert the new row.
  const { error: insertErr } = await supabase.from("project_images").insert({
    id: newId,
    project_id: projectId,
    kind: "filter_working_copy",
    name: workingCopyName,
    format: source.format,
    width_px: source.width_px,
    height_px: source.height_px,
    storage_bucket: PROJECT_IMAGES_BUCKET,
    storage_path: targetPath,
    file_size_bytes: source.file_size_bytes,
    is_active: false,
    source_image_id: source.id,
  })

  if (insertErr) {
    await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove([targetPath])
    return {
      ok: false,
      status: 400,
      stage: "db_insert",
      reason: insertErr.message,
      code: readPgCode(insertErr),
    }
  }

  const { data: signedData } = await supabase.storage
    .from(PROJECT_IMAGES_BUCKET)
    .createSignedUrl(targetPath, SIGNED_URL_TTL.filterWorkingCopy)

  return {
    ok: true,
    id: newId,
    storagePath: targetPath,
    widthPx: source.width_px,
    heightPx: source.height_px,
    signedUrl: signedData?.signedUrl ?? "",
    sourceImageId: source.id,
    name: source.name,
    created: true,
  }
}
