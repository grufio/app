import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

import { cleanupExistingMasters } from "./cleanup"
import { insertMasterRow, type InsertedMasterRow } from "./insert-master"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"

export async function insertMasterWithCleanup(args: {
  supabase: SupabaseClient<Database>
  imageId: string
  projectId: string
  file: File
  format: string
  widthPx: number
  heightPx: number
  imageDpi: number
  objectPath: string
}): Promise<
  | { ok: true; row: InsertedMasterRow }
  | { ok: false; reason: string; code?: string }
> {
  const { supabase, projectId, objectPath } = args

  const cleanup = await cleanupExistingMasters({ supabase, projectId })
  if (!cleanup.ok) {
    await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove([objectPath])
    return { ok: false, reason: cleanup.reason, code: cleanup.code }
  }

  let { data: row, error: dbErr } = await insertMasterRow(args)

  if (dbErr && (dbErr as { code?: string }).code === "23505") {
    const retryCleanup = await cleanupExistingMasters({ supabase, projectId })
    if (!retryCleanup.ok) {
      await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove([objectPath])
      return { ok: false, reason: retryCleanup.reason, code: retryCleanup.code }
    }
    ;({ data: row, error: dbErr } = await insertMasterRow(args))
  }

  if (dbErr || !row) {
    await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove([objectPath])
    return {
      ok: false,
      reason: dbErr?.message ?? "insertMasterRow returned no row",
      code: (dbErr as { code?: string } | undefined)?.code,
    }
  }

  return { ok: true, row }
}
