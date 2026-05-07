import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"

type ResetResult =
  | { ok: true; deletedFilterRows: number; softDeletedOutputs: number }
  | { ok: false; reason: string; code?: string }

export async function resetProjectFilterChain(args: {
  supabase: SupabaseClient<Database>
  projectId: string
}): Promise<ResetResult> {
  const { supabase, projectId } = args

  const { data: rows, error: selectErr } = await supabase
    .from("project_image_filters")
    .select("id,output_image_id")
    .eq("project_id", projectId)

  if (selectErr) {
    return { ok: false, reason: selectErr.message, code: selectErr.code }
  }

  if (!rows || rows.length === 0) {
    return { ok: true, deletedFilterRows: 0, softDeletedOutputs: 0 }
  }

  const outputImageIds = Array.from(
    new Set(rows.map((r) => String(r.output_image_id ?? "")).filter((id) => id.length > 0))
  )

  const { error: deleteErr } = await supabase
    .from("project_image_filters")
    .delete()
    .eq("project_id", projectId)

  if (deleteErr) {
    return { ok: false, reason: deleteErr.message, code: deleteErr.code }
  }

  if (outputImageIds.length === 0) {
    return { ok: true, deletedFilterRows: rows.length, softDeletedOutputs: 0 }
  }

  // Look up storage paths before the soft-delete so we can clean them up
  // in the same call (no eventual-consistent storage debt). RLS on the
  // tombstoned rows denies the auth client subsequent reads, so the
  // service role removes the objects.
  const { data: rowsToTombstone } = await supabase
    .from("project_images")
    .select("id,storage_bucket,storage_path")
    .eq("project_id", projectId)
    .eq("kind", "filter_working_copy")
    .is("deleted_at", null)
    .in("id", outputImageIds)

  const { error: updateErr } = await supabase
    .from("project_images")
    .update({ deleted_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("kind", "filter_working_copy")
    .is("deleted_at", null)
    .in("id", outputImageIds)

  if (updateErr) {
    return { ok: false, reason: updateErr.message, code: updateErr.code }
  }

  if (rowsToTombstone && rowsToTombstone.length > 0) {
    const service = createSupabaseServiceRoleClient()
    for (const row of rowsToTombstone) {
      if (!row.storage_path) continue
      try {
        await service.storage
          .from(row.storage_bucket ?? PROJECT_IMAGES_BUCKET)
          .remove([row.storage_path])
      } catch {
        // Best effort. Tombstone is committed — orphan is auditable.
      }
    }
  }

  return { ok: true, deletedFilterRows: rows.length, softDeletedOutputs: outputImageIds.length }
}
