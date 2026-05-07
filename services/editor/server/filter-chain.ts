import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database, Json } from "@/lib/supabase/database.types"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"

export async function appendProjectImageFilter(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  inputImageId: string
  outputImageId: string
  filterType: "pixelate" | "lineart" | "numerate"
  filterParams: Record<string, unknown>
}): Promise<{ ok: true } | { ok: false; stage: "chain_append"; reason: string; code?: string }> {
  const { supabase, projectId, inputImageId, outputImageId, filterType, filterParams } = args

  const { error } = await supabase.rpc("append_project_image_filter", {
    p_project_id: projectId,
    p_input_image_id: inputImageId,
    p_output_image_id: outputImageId,
    p_filter_type: filterType,
    p_filter_params: filterParams as Json,
  })
  if (error) {
    return { ok: false, stage: "chain_append", reason: error.message, code: error.code }
  }

  return { ok: true }
}

export async function cleanupOrphanFilterImage(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  imageId: string
  storagePath: string
}): Promise<void> {
  const { supabase, projectId, imageId, storagePath } = args
  await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove([storagePath])
  await supabase.from("project_images").delete().eq("project_id", projectId).eq("id", imageId)
}
