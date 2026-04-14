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

function pxToMicroPx(value: number): string {
  return (BigInt(toPositiveInt(value)) * 1_000_000n).toString()
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
  fallbackWhenMissingSource?: boolean
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const {
    supabase,
    projectId,
    sourceImageId,
    targetImageId,
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
    fallbackWhenMissingSource = false,
  } = args

  const { data: sourceTransform, error: loadErr } = await supabase
    .from("project_image_state")
    .select("x_px_u,y_px_u,width_px_u,height_px_u,rotation_deg")
    .eq("project_id", projectId)
    .eq("image_id", sourceImageId)
    .maybeSingle()

  if (loadErr) {
    return { ok: false, reason: `Failed to load source transform: ${loadErr.message}` }
  }

  if (!sourceTransform && !fallbackWhenMissingSource) {
    return { ok: false, reason: "Source image transform is missing" }
  }

  const targetTransform = sourceTransform
    ? {
        x_px_u: scaleMicroPx(BigInt(sourceTransform.x_px_u ?? "0"), targetWidth, sourceWidth),
        y_px_u: scaleMicroPx(BigInt(sourceTransform.y_px_u ?? "0"), targetHeight, sourceHeight),
        width_px_u: scaleMicroPx(BigInt(sourceTransform.width_px_u ?? "0"), targetWidth, sourceWidth),
        height_px_u: scaleMicroPx(BigInt(sourceTransform.height_px_u ?? "0"), targetHeight, sourceHeight),
        rotation_deg: sourceTransform.rotation_deg ?? 0,
      }
    : {
        x_px_u: "0",
        y_px_u: "0",
        width_px_u: pxToMicroPx(targetWidth),
        height_px_u: pxToMicroPx(targetHeight),
        rotation_deg: 0,
      }

  const { error: upsertErr } = await supabase.from("project_image_state").upsert(
    {
      project_id: projectId,
      image_id: targetImageId,
      role: "asset",
      x_px_u: targetTransform.x_px_u,
      y_px_u: targetTransform.y_px_u,
      width_px_u: targetTransform.width_px_u,
      height_px_u: targetTransform.height_px_u,
      rotation_deg: targetTransform.rotation_deg,
    },
    { onConflict: "project_id,image_id" }
  )

  if (upsertErr) {
    return { ok: false, reason: `Failed to upsert target transform: ${upsertErr.message}` }
  }

  return { ok: true }
}
