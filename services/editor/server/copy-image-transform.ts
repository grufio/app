/**
 * Copy and scale image transform when creating filter variants.
 *
 * When a filter creates a new image from a source, the new image should
 * inherit the source's transform, scaled proportionally if dimensions changed.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

export async function copyImageTransform(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  sourceImageId: string
  targetImageId: string
  sourceWidth: number
  sourceHeight: number
  targetWidth: number
  targetHeight: number
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { supabase, projectId, sourceImageId, targetImageId, sourceWidth, sourceHeight, targetWidth, targetHeight } = args

  // Load source transform
  const { data: sourceTransform, error: loadErr } = await supabase
    .from("project_image_state")
    .select("x_px_u,y_px_u,width_px_u,height_px_u,rotation_deg")
    .eq("project_id", projectId)
    .eq("image_id", sourceImageId)
    .maybeSingle()

  if (loadErr) {
    return { ok: false, reason: `Failed to load source transform: ${loadErr.message}` }
  }

  // If no source transform, skip (no transform to copy)
  if (!sourceTransform) {
    return { ok: true }
  }

  // Calculate scale factor
  const scaleX = targetWidth / sourceWidth
  const scaleY = targetHeight / sourceHeight

  // Scale transform
  const sourceX = BigInt(sourceTransform.x_px_u ?? "0")
  const sourceY = BigInt(sourceTransform.y_px_u ?? "0")
  const sourceW = BigInt(sourceTransform.width_px_u ?? "0")
  const sourceH = BigInt(sourceTransform.height_px_u ?? "0")

  const targetX = (Number(sourceX) * scaleX).toFixed(0)
  const targetY = (Number(sourceY) * scaleY).toFixed(0)
  const targetW = (Number(sourceW) * scaleX).toFixed(0)
  const targetH = (Number(sourceH) * scaleY).toFixed(0)

  // Insert new transform
  const { error: insertErr } = await supabase.from("project_image_state").insert({
    project_id: projectId,
    image_id: targetImageId,
    role: "asset",
    x_px_u: targetX,
    y_px_u: targetY,
    width_px_u: targetW,
    height_px_u: targetH,
    rotation_deg: sourceTransform.rotation_deg ?? 0,
  })

  if (insertErr) {
    return { ok: false, reason: `Failed to insert target transform: ${insertErr.message}` }
  }

  return { ok: true }
}
