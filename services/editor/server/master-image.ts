/**
 * Server-side master image fetch helper.
 *
 * Responsibilities:
 * - Fetch master image metadata from DB and create a short-lived signed URL.
 * - Prefer partial boot: if signing fails, return null (editor can still render).
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import type { MasterImage } from "@/lib/editor/use-master-image"

export async function getMasterImageForEditor(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ masterImage: MasterImage | null; error: string | null }> {
  const { data: img, error: imgErr } = await supabase
    .from("project_images")
    .select("id,storage_path,storage_bucket,name,width_px,height_px,dpi,role,is_active,deleted_at")
    .eq("project_id", projectId)
    .eq("role", "master")
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle()

  if (imgErr) return { masterImage: null, error: imgErr.message }
  if (!img?.storage_path) return { masterImage: null, error: null }

  const bucket = img.storage_bucket ?? "project_images"
  const { data: signed, error: signedErr } = await supabase.storage.from(bucket).createSignedUrl(img.storage_path, 60 * 10)
  if (signedErr || !signed?.signedUrl) {
    // Signing issues should not prevent editor boot.
    return { masterImage: null, error: null }
  }

  const dpiRaw = Number(img.dpi)
  const dpi = Number.isFinite(dpiRaw) && dpiRaw > 0 ? Math.round(dpiRaw) : null
  if (!dpi) {
    return { masterImage: null, error: "Invalid master image metadata: dpi" }
  }

  return {
    masterImage: {
      id: String(img.id ?? ""),
      signedUrl: signed.signedUrl,
      width_px: Number(img.width_px ?? 0),
      height_px: Number(img.height_px ?? 0),
      dpi,
      name: img.name ?? "master image",
    },
    error: null,
  }
}

