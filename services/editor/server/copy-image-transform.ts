/**
 * Copy and scale image transform when creating filter variants.
 *
 * When a filter creates a new image from a source, the new image should
 * inherit the source's transform, scaled proportionally if dimensions changed.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

function toPositiveInt(n: number): number {
  const v = Math.round(n)
  return Number.isFinite(v) && v > 0 ? v : 1
}

function scaleMicroPx(value: bigint, numerator: number, denominator: number): string {
  const num = BigInt(toPositiveInt(numerator))
  const den = BigInt(toPositiveInt(denominator))
  // Round half up in integer space to avoid float precision drift.
  const scaled = (value * num + den / 2n) / den
  return scaled.toString()
}

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

  const { data: sourceTransform, error: loadErr } = await supabase
    .from("project_image_state")
    .select("x_px_u,y_px_u,width_px_u,height_px_u,rotation_deg")
    .eq("project_id", projectId)
    .eq("image_id", sourceImageId)
    .maybeSingle()

  if (loadErr) {
    return { ok: false, reason: `Failed to load source transform: ${loadErr.message}` }
  }

  if (!sourceTransform) {
    return { ok: true }
  }

  const sourceX = BigInt(sourceTransform.x_px_u ?? "0")
  const sourceY = BigInt(sourceTransform.y_px_u ?? "0")
  const sourceW = BigInt(sourceTransform.width_px_u ?? "0")
  const sourceH = BigInt(sourceTransform.height_px_u ?? "0")

  const targetX = scaleMicroPx(sourceX, targetWidth, sourceWidth)
  const targetY = scaleMicroPx(sourceY, targetHeight, sourceHeight)
  const targetW = scaleMicroPx(sourceW, targetWidth, sourceWidth)
  const targetH = scaleMicroPx(sourceH, targetHeight, sourceHeight)

  const { error: upsertErr } = await supabase.from("project_image_state").upsert(
    {
      project_id: projectId,
      image_id: targetImageId,
      role: "asset",
      x_px_u: targetX,
      y_px_u: targetY,
      width_px_u: targetW,
      height_px_u: targetH,
      rotation_deg: sourceTransform.rotation_deg ?? 0,
    },
    { onConflict: "project_id,image_id" }
  )

  if (upsertErr) {
    return { ok: false, reason: `Failed to upsert target transform: ${upsertErr.message}` }
  }

  return { ok: true }
}
