/**
 * Image-state repository helpers.
 *
 * Responsibilities:
 * - Load persisted master transform state bound to a specific active image id.
 * - Enforce the canonical µpx invariant (`width_px_u` / `height_px_u` must exist).
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export type BoundImageStateRow = {
  image_id: string | null
  x_px_u: string | null
  y_px_u: string | null
  width_px_u: string
  height_px_u: string
  rotation_deg: number
}

export type BoundImageStateUpsert = {
  project_id: string
  image_id: string
  role: "master" | "working"
  x_px_u: string | null
  y_px_u: string | null
  width_px_u: string
  height_px_u: string
  rotation_deg: number
}

export async function loadBoundImageState(
  supabase: SupabaseClient,
  projectId: string,
  activeImageId: string | null
): Promise<{ row: BoundImageStateRow | null; error: string | null; unsupported: boolean }> {
  if (!activeImageId) return { row: null, error: null, unsupported: false }

  const { data, error } = await supabase
    .from("project_image_state")
    .select("image_id,x_px_u,y_px_u,width_px_u,height_px_u,rotation_deg,role")
    .eq("project_id", projectId)
    .eq("role", "master")
    .eq("image_id", activeImageId)
    .maybeSingle()

  if (error) return { row: null, error: error.message, unsupported: false }
  if (!data) return { row: null, error: null, unsupported: false }

  if (!data.width_px_u || !data.height_px_u) {
    return { row: null, error: null, unsupported: true }
  }

  return {
    row: {
      image_id: typeof data.image_id === "string" ? data.image_id : null,
      x_px_u: typeof data.x_px_u === "string" ? data.x_px_u : null,
      y_px_u: typeof data.y_px_u === "string" ? data.y_px_u : null,
      width_px_u: data.width_px_u,
      height_px_u: data.height_px_u,
      rotation_deg: Number(data.rotation_deg ?? 0),
    },
    error: null,
    unsupported: false,
  }
}

export async function upsertBoundImageState(
  supabase: SupabaseClient,
  row: BoundImageStateUpsert
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("project_image_state").upsert(row, { onConflict: "project_id,role" })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

