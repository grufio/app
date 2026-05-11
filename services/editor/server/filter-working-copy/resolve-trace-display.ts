import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"
import { SIGNED_URL_TTL } from "@/lib/storage/signed-url-ttl"

import type { FilterPanelDisplay } from "./types"

/**
 * If the project has an active Trace artefact (project_image_trace
 * row), resolve its output image into a `display` payload that
 * overrides the filter chain tip. Returns `null` when no trace
 * exists, the row references a missing/tombstoned image, or signed
 * URL generation fails — the caller falls back to the filter chain.
 */
export async function resolveTraceDisplay(args: {
  supabase: SupabaseClient<Database>
  projectId: string
}): Promise<FilterPanelDisplay | null> {
  const { supabase, projectId } = args

  const { data: traceRow } = await supabase
    .from("project_image_trace")
    .select("output_image_id")
    .eq("project_id", projectId)
    .maybeSingle()

  if (!traceRow?.output_image_id) return null

  const { data: imageRow } = await supabase
    .from("project_images")
    .select("id,storage_bucket,storage_path,width_px,height_px,source_image_id,name")
    .eq("project_id", projectId)
    .eq("id", traceRow.output_image_id)
    .is("deleted_at", null)
    .maybeSingle()

  if (!imageRow) return null

  const { data: signedData } = await supabase.storage
    .from(String(imageRow.storage_bucket ?? PROJECT_IMAGES_BUCKET))
    .createSignedUrl(String(imageRow.storage_path), SIGNED_URL_TTL.filterWorkingCopy)

  if (!signedData?.signedUrl) return null

  return {
    id: String(imageRow.id),
    storagePath: String(imageRow.storage_path),
    widthPx: Number(imageRow.width_px ?? 0),
    heightPx: Number(imageRow.height_px ?? 0),
    signedUrl: signedData.signedUrl,
    sourceImageId: imageRow.source_image_id ? String(imageRow.source_image_id) : null,
    name: String(imageRow.name ?? ""),
    isFilterResult: true,
  }
}
