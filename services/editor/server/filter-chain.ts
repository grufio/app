import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

export async function appendProjectImageFilter(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  inputImageId: string
  outputImageId: string
  filterType: "pixelate" | "lineart" | "numerate"
  filterParams: Record<string, unknown>
}): Promise<{ ok: true } | { ok: false; reason: string; code?: string }> {
  const { supabase, projectId, inputImageId, outputImageId, filterType, filterParams } = args

  const { data: maxRow, error: maxErr } = await supabase
    .from("project_image_filters")
    .select("stack_order")
    .eq("project_id", projectId)
    .order("stack_order", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxErr) {
    return { ok: false, reason: maxErr.message, code: maxErr.code }
  }

  const nextOrder = Number(maxRow?.stack_order ?? 0) + 1
  const { error: insertErr } = await supabase.from("project_image_filters").insert({
    project_id: projectId,
    input_image_id: inputImageId,
    output_image_id: outputImageId,
    filter_type: filterType,
    filter_params: filterParams,
    stack_order: nextOrder,
  })
  if (insertErr) {
    return { ok: false, reason: insertErr.message, code: insertErr.code }
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
  await supabase.storage.from("project_images").remove([storagePath])
  await supabase.from("project_images").delete().eq("project_id", projectId).eq("id", imageId)
}
