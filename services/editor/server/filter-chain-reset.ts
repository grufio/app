import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

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

  return { ok: true, deletedFilterRows: rows.length, softDeletedOutputs: outputImageIds.length }
}
