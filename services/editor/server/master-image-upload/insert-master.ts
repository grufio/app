import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"

export async function insertMasterRow(args: {
  supabase: SupabaseClient<Database>
  imageId: string
  projectId: string
  file: File
  format: string
  widthPx: number
  heightPx: number
  imageDpi: number
  objectPath: string
}) {
  const { supabase, imageId, projectId, file, format, widthPx, heightPx, imageDpi, objectPath } = args
  return supabase.from("project_images").insert({
    id: imageId,
    project_id: projectId,
    kind: "master",
    name: file.name,
    format,
    width_px: widthPx,
    height_px: heightPx,
    dpi: imageDpi,
    storage_bucket: PROJECT_IMAGES_BUCKET,
    storage_path: objectPath,
    file_size_bytes: file.size,
    is_active: false,
  })
}
