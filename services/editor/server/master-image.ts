/**
 * Server-side master image fetch helper.
 *
 * Responsibilities:
 * - Fetch active image metadata from DB and create a short-lived signed URL.
 * - Prefer partial boot: if signing fails, return null (editor can still render).
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import type { MasterImage } from "@/lib/editor/hooks/use-master-image"
import { SIGNED_URL_TTL } from "@/lib/storage/signed-url-ttl"
import { getEditorTargetImageRow } from "@/lib/supabase/project-images"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"

export async function getMasterImageForEditor(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ masterImage: MasterImage | null; error: string | null }> {
  const target = await getEditorTargetImageRow(supabase, projectId)
  if (target.error) return { masterImage: null, error: target.error.reason }
  const img = target.row
  if (!img?.storage_path) return { masterImage: null, error: null }

  const { data: restoreBase, error: restoreBaseErr } = await supabase
    .from("project_images")
    .select("id,width_px,height_px,dpi")
    .eq("project_id", projectId)
    .eq("kind", "master")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (restoreBaseErr) return { masterImage: null, error: restoreBaseErr.message }

  const bucket = img.storage_bucket ?? PROJECT_IMAGES_BUCKET
  const { data: signed, error: signedErr } = await supabase.storage.from(bucket).createSignedUrl(img.storage_path, SIGNED_URL_TTL.thumbnail)
  if (signedErr || !signed?.signedUrl) {
    // Signing issues should not prevent editor boot.
    return { masterImage: null, error: null }
  }

  const dpiRaw = Number(img.dpi)
  const dpi = Number.isFinite(dpiRaw) && dpiRaw > 0 ? Math.round(dpiRaw) : null

  return {
    masterImage: {
      id: String(img.id ?? ""),
      signedUrl: signed.signedUrl,
      width_px: Number(img.width_px ?? 0),
      height_px: Number(img.height_px ?? 0),
      dpi,
      name: img.name ?? "master image",
      restore_base:
        restoreBase && Number(restoreBase.width_px) > 0 && Number(restoreBase.height_px) > 0
          ? {
              id: String(restoreBase.id),
              width_px: Number(restoreBase.width_px),
              height_px: Number(restoreBase.height_px),
              dpi: restoreBase.dpi == null ? null : Number(restoreBase.dpi),
            }
          : null,
    },
    error: null,
  }
}

