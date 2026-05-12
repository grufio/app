/**
 * Image-state repository helpers.
 *
 * Responsibilities:
 * - Load/upsert the persisted transform row for a project.
 * - Enforce the canonical µpx invariant (`width_px_u` / `height_px_u`
 *   must exist; a row without them is reported as `unsupported`).
 *
 * Anchor invariant (post PR #124): every state row's `image_id` is
 * the project's `master.id`. Callers should resolve master.id via
 * `getProjectMasterImageRow` (lib/supabase/project-images.ts) before
 * invoking these helpers. The `activeImageId` / `image_id` parameters
 * are kept generic here so callers retain control, but the route
 * handler in `app/api/projects/[projectId]/image-state/route.ts`
 * always passes master.id.
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

/**
 * Full row written by `upsertBoundImageState`. Per-axis preservation is
 * resolved upstream (in the API route) by reading the existing row and
 * filling in unchanged axes; this layer always writes a complete row.
 */
export type BoundImageStateUpsert = {
  project_id: string
  image_id: string
  x_px_u: string | null
  y_px_u: string | null
  width_px_u: string
  height_px_u: string
  rotation_deg: number
}

/**
 * Reads the transform row at `(projectId, activeImageId)`.
 *
 * Returns `{ row: null, error: null, unsupported: false }` when:
 * - `activeImageId` is null (short-circuit, no query fired)
 * - No row exists at that key
 *
 * Returns `{ row: null, error: null, unsupported: true }` when a row
 * exists but is missing canonical µpx dimensions — surfaces the
 * schema-drift detection to the caller without coercing defaults.
 *
 * Returns `{ row: null, error: <message>, unsupported: false }` on DB
 * errors. Caller is responsible for surfacing the message.
 */
export async function loadBoundImageState(
  supabase: SupabaseClient,
  projectId: string,
  activeImageId: string | null
): Promise<{ row: BoundImageStateRow | null; error: string | null; unsupported: boolean }> {
  if (!activeImageId) return { row: null, error: null, unsupported: false }

  const { data, error } = await supabase
    .from("project_image_state")
    .select("image_id,x_px_u,y_px_u,width_px_u,height_px_u,rotation_deg")
    .eq("project_id", projectId)
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

/**
 * Writes (insert-or-update) the transform row keyed by
 * `(project_id, image_id)`. The row is always fully replaced; per-
 * axis preservation is the caller's responsibility (the route handler
 * reads the existing row, merges omitted axes, then passes a complete
 * row here).
 *
 * The `image_id` field must be the project's master.id post PR #124.
 * No assertion at this layer — caller (the route handler) resolves
 * master.id via `getProjectMasterImageRow` before invoking.
 */
export async function upsertBoundImageState(
  supabase: SupabaseClient,
  row: BoundImageStateUpsert
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Defensive boundary assertion: catches the type-contract gap where
  // callers might pass an unresolved master.id. The route handler
  // resolves master.id via `getProjectMasterImageRow` before invoking;
  // a null here means the caller bypassed the master-resolution step.
  if (!row.image_id) {
    throw new Error("upsertBoundImageState: image_id required (resolve master.id before calling)")
  }
  const { error } = await supabase.from("project_image_state").upsert(row, { onConflict: "project_id,image_id" })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
