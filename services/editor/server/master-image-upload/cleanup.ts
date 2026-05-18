import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

import type { ExistingMasterRow } from "./types"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"

async function removeStorageObjectsByBucket(
  supabase: SupabaseClient<Database>,
  rows: ExistingMasterRow[]
): Promise<{ ok: true } | { ok: false; reason: string; code?: string }> {
  const pathsByBucket = new Map<string, string[]>()
  for (const row of rows) {
    if (!row.storage_path) continue
    const bucket = row.storage_bucket ?? PROJECT_IMAGES_BUCKET
    const paths = pathsByBucket.get(bucket)
    if (paths) {
      paths.push(row.storage_path)
    } else {
      pathsByBucket.set(bucket, [row.storage_path])
    }
  }

  for (const [bucket, paths] of pathsByBucket.entries()) {
    if (!paths.length) continue
    const { error } = await supabase.storage.from(bucket).remove(paths)
    if (error) {
      return {
        ok: false,
        reason: `storage cleanup failed for bucket=${bucket}: ${error.message}`,
        code: (error as { code?: string }).code,
      }
    }
  }
  return { ok: true }
}

export async function cleanupExistingMasters(args: {
  supabase: SupabaseClient<Database>
  projectId: string
}): Promise<{ ok: true } | { ok: false; reason: string; code?: string }> {
  const { supabase, projectId } = args
  const { data, error } = await supabase
    .from("project_images")
    .select("id,storage_bucket,storage_path")
    .eq("project_id", projectId)
    .eq("kind", "master")
    .is("deleted_at", null)

  if (error) return { ok: false, reason: error.message, code: (error as { code?: string }).code }

  const existing = ((data ?? []) as Array<{ id: string; storage_bucket: string | null; storage_path: string | null }>).map((row) => ({
    id: String(row.id),
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path,
  }))
  if (!existing.length) return { ok: true }

  // Tear down any existing trace state first. The trace_base/trace_output
  // rows cascade-delete via project_images.source_image_id when the
  // master goes, but project_image_trace.base_image_id pins trace_base
  // with ON DELETE RESTRICT — the cascade would fail with FK violation
  // 23503 (and the master upload would die mid-flow) until the trace
  // row is gone. Collect their storage paths first so we can remove
  // them after the cascade, instead of leaving orphans.
  const { data: traceRow, error: traceLookupErr } = await supabase
    .from("project_image_trace")
    .select("output_image_id,base_image_id")
    .eq("project_id", projectId)
    .maybeSingle()
  if (traceLookupErr) {
    return { ok: false, reason: traceLookupErr.message, code: (traceLookupErr as { code?: string }).code }
  }

  let traceArtefactPaths: ExistingMasterRow[] = []
  if (traceRow) {
    const traceImageIds = [
      traceRow.output_image_id ? String(traceRow.output_image_id) : "",
      traceRow.base_image_id ? String(traceRow.base_image_id) : "",
    ].filter((id) => id.length > 0)

    if (traceImageIds.length > 0) {
      const { data: traceImages } = await supabase
        .from("project_images")
        .select("id,storage_bucket,storage_path")
        .eq("project_id", projectId)
        .in("id", traceImageIds)
      traceArtefactPaths = ((traceImages ?? []) as Array<{ id: string; storage_bucket: string | null; storage_path: string | null }>).map((row) => ({
        id: String(row.id),
        storage_bucket: row.storage_bucket,
        storage_path: row.storage_path,
      }))
    }

    const { error: traceDeleteErr } = await supabase
      .from("project_image_trace")
      .delete()
      .eq("project_id", projectId)
    if (traceDeleteErr) {
      return { ok: false, reason: traceDeleteErr.message, code: (traceDeleteErr as { code?: string }).code }
    }
  }

  const { error: deleteErr } = await supabase
    .from("project_images")
    .delete()
    .eq("project_id", projectId)
    .eq("kind", "master")
    .is("deleted_at", null)

  if (deleteErr) return { ok: false, reason: deleteErr.message, code: (deleteErr as { code?: string }).code }

  const cleanup = await removeStorageObjectsByBucket(supabase, [...existing, ...traceArtefactPaths])
  if (!cleanup.ok) return cleanup
  return { ok: true }
}
