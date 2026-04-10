import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

import type { ExistingMasterRow } from "./types"

async function removeStorageObjectsByBucket(
  supabase: SupabaseClient<Database>,
  rows: ExistingMasterRow[]
): Promise<{ ok: true } | { ok: false; reason: string; code?: string }> {
  const pathsByBucket = new Map<string, string[]>()
  for (const row of rows) {
    if (!row.storage_path) continue
    const bucket = row.storage_bucket ?? "project_images"
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
    .eq("role", "master")
    .is("deleted_at", null)

  if (error) return { ok: false, reason: error.message, code: (error as { code?: string }).code }

  const existing = ((data ?? []) as Array<{ id: string; storage_bucket: string | null; storage_path: string | null }>).map((row) => ({
    id: String(row.id),
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path,
  }))
  if (!existing.length) return { ok: true }

  const { error: deleteErr } = await supabase
    .from("project_images")
    .delete()
    .eq("project_id", projectId)
    .eq("role", "master")
    .is("deleted_at", null)

  if (deleteErr) return { ok: false, reason: deleteErr.message, code: (deleteErr as { code?: string }).code }

  const cleanup = await removeStorageObjectsByBucket(supabase, existing)
  if (!cleanup.ok) return cleanup
  return { ok: true }
}
