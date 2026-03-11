import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

import { cleanupExistingMasters } from "./cleanup"
import { insertMasterRow } from "./insert-master"

export async function insertMasterWithCleanup(args: {
  supabase: SupabaseClient<Database>
  imageId: string
  projectId: string
  file: File
  format: string
  widthPx: number
  heightPx: number
  dpiX: number
  dpiY: number
  imageDpi: number
  bitDepth: number
  objectPath: string
}): Promise<{ ok: true } | { ok: false; reason: string; code?: string }> {
  const { supabase, projectId, objectPath } = args

  const cleanup = await cleanupExistingMasters({ supabase, projectId })
  if (!cleanup.ok) {
    await supabase.storage.from("project_images").remove([objectPath])
    return { ok: false, reason: cleanup.reason, code: cleanup.code }
  }

  let { error: dbErr } = await insertMasterRow(args)

  if (dbErr && (dbErr as { code?: string }).code === "23505") {
    const retryCleanup = await cleanupExistingMasters({ supabase, projectId })
    if (!retryCleanup.ok) {
      await supabase.storage.from("project_images").remove([objectPath])
      return { ok: false, reason: retryCleanup.reason, code: retryCleanup.code }
    }
    dbErr = (await insertMasterRow(args)).error
  }

  if (dbErr) {
    await supabase.storage.from("project_images").remove([objectPath])
    return { ok: false, reason: dbErr.message, code: (dbErr as { code?: string }).code }
  }

  return { ok: true }
}
