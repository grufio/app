import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"

export type InsertedMasterRow = Database["public"]["Tables"]["project_images"]["Row"]

export async function insertMasterRow(args: {
  supabase: SupabaseClient<Database>
  imageId: string
  projectId: string
  /** Display name from the client upload (`File.name`). */
  fileName: string
  /** Byte length of what was actually written to Storage — must
   * match the bytes whose dimensions populate `widthPx`/`heightPx`. */
  fileSizeBytes: number
  format: string
  widthPx: number
  heightPx: number
  imageDpi: number
  objectPath: string
}) {
  const { supabase, imageId, projectId, fileName, fileSizeBytes, format, widthPx, heightPx, imageDpi, objectPath } = args
  return supabase
    .from("project_images")
    .insert({
      id: imageId,
      project_id: projectId,
      kind: "master",
      name: fileName,
      format,
      width_px: widthPx,
      height_px: heightPx,
      dpi: imageDpi,
      storage_bucket: PROJECT_IMAGES_BUCKET,
      storage_path: objectPath,
      file_size_bytes: fileSizeBytes,
      is_active: false,
    })
    .select("*")
    .single<InsertedMasterRow>()
}
