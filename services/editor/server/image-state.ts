/**
 * Server-side image state fetch helper.
 *
 * Responsibilities:
 * - Fetch the persisted image transform state (µpx) for editor hydration.
 * - Enforce invariant: if a row exists but canonical µpx size is missing, treat as unsupported.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import type { ImageState } from "@/lib/editor/use-image-state"
import { parseBigIntString } from "@/lib/editor/imageState"

export async function getImageStateForEditor(
  supabase: SupabaseClient,
  projectId: string,
  activeImageId: string | null
): Promise<{ imageState: ImageState | null; error: string | null; unsupported: boolean }> {
  if (!activeImageId) return { imageState: null, error: null, unsupported: false }

  const { data: st, error: stErr } = await supabase
    .from("project_image_state")
    .select("image_id,x_px_u,y_px_u,width_px_u,height_px_u,rotation_deg,role")
    .eq("project_id", projectId)
    .eq("role", "master")
    .eq("image_id", activeImageId)
    .maybeSingle()

  if (stErr) return { imageState: null, error: stErr.message, unsupported: false }
  if (!st) return { imageState: null, error: null, unsupported: false }

  const widthPxU = parseBigIntString(st.width_px_u)
  const heightPxU = parseBigIntString(st.height_px_u)
  if (!widthPxU || !heightPxU) {
    return { imageState: null, error: null, unsupported: true }
  }
  const xPxU = parseBigIntString(st.x_px_u)
  const yPxU = parseBigIntString(st.y_px_u)
  const rotationDeg = Number(st.rotation_deg ?? 0)

  return {
    imageState: {
      imageId: typeof st.image_id === "string" ? st.image_id : undefined,
      xPxU: xPxU ?? undefined,
      yPxU: yPxU ?? undefined,
      widthPxU,
      heightPxU,
      rotationDeg,
    },
    error: null,
    unsupported: false,
  }
}

