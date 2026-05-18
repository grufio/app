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

  // `guard_master_immutable` (BEFORE DELETE) blocks plain DELETE on
  // kind='master'. The `delete_master_with_cascade` RPC sets the
  // `app.deleting_project` GUC inside the transaction so the trigger
  // waives immutability for this project, then deletes every
  // dependent image row in the correct order and returns their
  // storage paths so we can remove the bucket objects.
  const rpc = supabase as unknown as {
    rpc(
      fn: "delete_master_with_cascade",
      args: { p_project_id: string },
    ): Promise<{
      data: Array<{ storage_bucket: string | null; storage_path: string | null }> | null
      error: { message: string; code?: string } | null
    }>
  }
  const { data, error } = await rpc.rpc("delete_master_with_cascade", {
    p_project_id: projectId,
  })

  if (error) return { ok: false, reason: error.message, code: error.code }

  const removed: ExistingMasterRow[] = (data ?? []).map((row, idx) => ({
    id: String(idx),
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path,
  }))
  if (!removed.length) return { ok: true }

  const cleanup = await removeStorageObjectsByBucket(supabase, removed)
  if (!cleanup.ok) return cleanup
  return { ok: true }
}
