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
    .select("storage_path,name,width_px,height_px,role")
    .eq("project_id", projectId)
    .eq("role", "master")
    .maybeSingle()

  if (imgErr) return { masterImage: null, error: imgErr.message }
  if (!img?.storage_path) return { masterImage: null, error: null }

  const { data: signed, error: signedErr } = await supabase.storage.from("project_images").createSignedUrl(img.storage_path, 60 * 10)
  if (signedErr || !signed?.signedUrl) {
    // Signing issues should not prevent editor boot.
    return { masterImage: null, error: null }
  }

  return {
    masterImage: {
      signedUrl: signed.signedUrl,
      width_px: Number(img.width_px ?? 0),
      height_px: Number(img.height_px ?? 0),
      dpi: null,
      name: img.name ?? "master image",
    },
    error: null,
  }
}

