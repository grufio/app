import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

export async function softDeleteCopies(
  supabase: SupabaseClient<Database>,
  ids: string[],
): Promise<{ ok: true } | { ok: false; reason: string; code?: string }> {
  if (!ids.length) return { ok: true }

  // Look up storage paths *before* soft-delete so we can clean them up in
  // the same call. Eventual-consistent storage cleanup used to leave
  // orphaned objects accumulating in `project_images` bucket; now the row
  // tombstone (auditable) and the physical removal happen together.
  const { data: rows } = await supabase
    .from("project_images")
    .select("id,storage_bucket,storage_path")
    .in("id", ids)
    .is("deleted_at", null)

  const { error } = await supabase
    .from("project_images")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids)
  if (error) {
    return { ok: false, reason: error.message, code: error.code }
  }

  // Storage delete is service-role because the auth user's RLS denies
  // it on tombstoned rows once `deleted_at` is set. Best-effort: a
  // failed storage remove leaves an orphan but the audit row already
  // marks it for sweep; it must not regress the soft-delete commit.
  if (rows && rows.length > 0) {
    const service = createSupabaseServiceRoleClient()
    for (const row of rows) {
      if (!row.storage_path) continue
      try {
        await service.storage
          .from(row.storage_bucket ?? PROJECT_IMAGES_BUCKET)
          .remove([row.storage_path])
      } catch {
        // Swallow per-row to keep behaviour close-to-eventual; row is
        // tombstoned, sweep can mop up.
      }
    }
  }

  return { ok: true }
}
