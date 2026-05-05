import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

export async function insertMasterRow(args: {
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
}) {
  const { supabase, imageId, projectId, file, format, widthPx, heightPx, dpiX, dpiY, imageDpi, bitDepth, objectPath } = args
  return supabase.from("project_images").insert({
    id: imageId,
    project_id: projectId,
    kind: "master",
    name: file.name,
    format,
    width_px: widthPx,
    height_px: heightPx,
    dpi_x: dpiX,
    dpi_y: dpiY,
    dpi: imageDpi,
    bit_depth: bitDepth,
    storage_bucket: "project_images",
    storage_path: objectPath,
    file_size_bytes: file.size,
    is_active: false,
  })
}
