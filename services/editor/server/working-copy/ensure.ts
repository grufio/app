/**
 * Lazy working-copy creation for filter/trace flows.
 *
 * Master uploads no longer auto-create a working_copy — the
 * working_copy is only materialised when something needs to mutate
 * pixel data (filter apply). This helper:
 *
 * 1. Looks up an existing `kind='working_copy'` row for the project.
 * 2. If none, server-side copies the master file in the storage
 *    bucket (no client round-trip), inserts the working_copy DB row,
 *    and returns its id + path.
 *
 * Concurrency note: in this single-user app, concurrent filter
 * applies on the same project are not expected. The SELECT-then-
 * INSERT pattern carries a benign race window — two concurrent
 * callers might both create a working_copy. Subsequent reads pick
 * the newest deterministically; the orphan row is best-effort
 * cleanup-able. If concurrency becomes a real concern, promote
 * the helper to an RPC with `pg_advisory_xact_lock(hashtext(project_id))`
 * mirroring the cascade-delete pattern.
 */
import crypto from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"

function readPgCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code
    return typeof code === "string" ? code : undefined
  }
  return undefined
}

export type EnsureWorkingCopyResult =
  | {
      ok: true
      imageId: string
      objectPath: string
      bucket: string
      format: string
      widthPx: number
      heightPx: number
      fileSizeBytes: number
      sourceMasterId: string
      created: boolean
    }
  | {
      ok: false
      stage: "no_master" | "lookup" | "storage_copy" | "db_insert"
      reason: string
      code?: string
    }

export async function ensureWorkingCopyExists(args: {
  supabase: SupabaseClient<Database>
  projectId: string
}): Promise<EnsureWorkingCopyResult> {
  const { supabase, projectId } = args

  // Step 1 — existing working_copy?
  const { data: existing, error: existingErr } = await supabase
    .from("project_images")
    .select("id,storage_bucket,storage_path,format,width_px,height_px,file_size_bytes,source_image_id")
    .eq("project_id", projectId)
    .eq("kind", "working_copy")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingErr) {
    return { ok: false, stage: "lookup", reason: existingErr.message, code: readPgCode(existingErr) }
  }
  if (existing?.id) {
    return {
      ok: true,
      imageId: String(existing.id),
      objectPath: String(existing.storage_path ?? ""),
      bucket: String(existing.storage_bucket ?? PROJECT_IMAGES_BUCKET),
      format: String(existing.format ?? ""),
      widthPx: Number(existing.width_px ?? 0),
      heightPx: Number(existing.height_px ?? 0),
      fileSizeBytes: Number(existing.file_size_bytes ?? 0),
      sourceMasterId: String(existing.source_image_id ?? ""),
      created: false,
    }
  }

  // Step 2 — load master row to copy from
  const { data: master, error: masterErr } = await supabase
    .from("project_images")
    .select("id,storage_bucket,storage_path,format,width_px,height_px,dpi,file_size_bytes,name")
    .eq("project_id", projectId)
    .eq("kind", "master")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (masterErr) {
    return { ok: false, stage: "lookup", reason: masterErr.message, code: readPgCode(masterErr) }
  }
  if (!master?.id || !master.storage_path) {
    return { ok: false, stage: "no_master", reason: "Project has no master image to copy from" }
  }

  // Step 3 — server-side storage copy (no bytes via client)
  const workingCopyId = crypto.randomUUID()
  const sourceBucket = String(master.storage_bucket ?? PROJECT_IMAGES_BUCKET)
  const targetPath = `projects/${projectId}/images/${workingCopyId}`
  const masterPath = String(master.storage_path)

  const copyResult = await supabase.storage.from(sourceBucket).copy(masterPath, targetPath, {
    destinationBucket: PROJECT_IMAGES_BUCKET,
  })
  const copyErr = (copyResult as { error?: { message?: string; code?: string } } | null | undefined)?.error
  if (copyErr) {
    return {
      ok: false,
      stage: "storage_copy",
      reason: copyErr.message ?? "Failed to copy master to working_copy",
      code: (copyErr as { code?: string }).code,
    }
  }

  // Step 4 — insert working_copy row
  const masterName = master.name ? String(master.name) : "image"
  const { error: insertErr } = await supabase.from("project_images").insert({
    id: workingCopyId,
    project_id: projectId,
    kind: "working_copy",
    name: `${masterName} (working copy)`,
    format: String(master.format ?? ""),
    width_px: Number(master.width_px ?? 0),
    height_px: Number(master.height_px ?? 0),
    dpi: master.dpi == null ? null : Number(master.dpi),
    storage_bucket: PROJECT_IMAGES_BUCKET,
    storage_path: targetPath,
    file_size_bytes: Number(master.file_size_bytes ?? 0),
    is_active: false,
    source_image_id: String(master.id),
  })
  if (insertErr) {
    // Rollback the storage copy to avoid an orphan file.
    await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove([targetPath])
    return {
      ok: false,
      stage: "db_insert",
      reason: insertErr.message,
      code: readPgCode(insertErr),
    }
  }

  return {
    ok: true,
    imageId: workingCopyId,
    objectPath: targetPath,
    bucket: PROJECT_IMAGES_BUCKET,
    format: String(master.format ?? ""),
    widthPx: Number(master.width_px ?? 0),
    heightPx: Number(master.height_px ?? 0),
    fileSizeBytes: Number(master.file_size_bytes ?? 0),
    sourceMasterId: String(master.id),
    created: true,
  }
}
