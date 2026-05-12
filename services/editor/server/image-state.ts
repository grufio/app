/**
 * Server-side image state fetch helper.
 *
 * Responsibilities:
 * - Fetch the persisted image transform state (µpx) for editor hydration.
 * - State is anchored at the project's master.id (PR #124).
 * - Enforce invariant: if a row exists but canonical µpx size is
 *   missing, treat as unsupported.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import type { ImageState } from "@/lib/editor/hooks/use-image-state"
import { parseBigIntString } from "@/lib/editor/imageState"
import { loadBoundImageState } from "@/lib/supabase/image-state"
import { getProjectMasterImageId } from "@/lib/supabase/project-images"

export async function getImageStateForEditor(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ imageState: ImageState | null; error: string | null; unsupported: boolean }> {
  const { masterId, error: masterErr } = await getProjectMasterImageId(supabase, projectId)
  if (masterErr) return { imageState: null, error: masterErr, unsupported: false }
  if (!masterId) return { imageState: null, error: null, unsupported: false }

  const { row: st, error: stErr, unsupported } = await loadBoundImageState(supabase, projectId, masterId)
  if (stErr) return { imageState: null, error: stErr, unsupported: false }
  if (unsupported) return { imageState: null, error: null, unsupported: true }
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
