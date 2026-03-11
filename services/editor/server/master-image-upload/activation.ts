import type { SupabaseClient } from "@supabase/supabase-js"

import { activateMasterWithState } from "@/lib/supabase/project-images"
import type { Database } from "@/lib/supabase/database.types"

export async function activateInsertedMaster(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  imageId: string
  widthPx: number
  heightPx: number
  imageDpi: number
  objectPath: string
}): Promise<{ ok: true } | { ok: false; status: number; stage: "active_switch" | "lock_conflict"; reason: string; code?: string }> {
  const { supabase, projectId, imageId, widthPx, heightPx, imageDpi, objectPath } = args
  const activation = await activateMasterWithState({
    supabase,
    projectId,
    imageId,
    widthPx,
    heightPx,
    imageDpi,
  })
  if (!activation.ok) {
    await supabase.from("project_images").delete().eq("id", imageId).eq("project_id", projectId)
    await supabase.storage.from("project_images").remove([objectPath])
    return activation
  }

  return { ok: true }
}
