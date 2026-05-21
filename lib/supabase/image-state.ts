/**
 * Image-state repository helpers.
 *
 * Responsibilities:
 * - Load/upsert the persisted transform row for a project.
 * - Enforce the canonical µpx invariant (`width_px_u` / `height_px_u`
 *   must exist; a row without them is reported as `unsupported`).
 *
 * Anchor invariant (post the working-copy refactor): every state row's
 * `image_id` is the project's `working_copy.id`. The master row is
 * immutable per user-model; all editable-state mutations belong to the
 * working_copy. Callers resolve working_copy.id via
 * `resolveStateAnchorImage` before invoking these helpers. Legacy
 * projects without a working_copy row fall back to master.id (one-time
 * compatibility, will be removed once the data migration is verified).
 *
 * History: anchor was at master.id (PR #124) until the working-copy
 * refactor (this PR). PR #124's bug — state orphaned by filter-chain
 * tip mutations — stays fixed because working_copy is itself stable
 * (one per project, not affected by filter_working_copy chain resets).
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
 * The `image_id` field must be the project's working_copy.id (post the
 * working-copy refactor). Callers resolve it via
 * `resolveStateAnchorImage` before invoking.
 */
export async function upsertBoundImageState(
  supabase: SupabaseClient,
  row: BoundImageStateUpsert
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Defensive boundary assertion: catches the type-contract gap where
  // callers might pass null/empty. The route handler resolves
  // working_copy.id via `resolveStateAnchorImage` before invoking.
  if (!row.image_id) {
    throw new Error("upsertBoundImageState: image_id required (resolve working_copy.id before calling)")
  }
  const { error } = await supabase.from("project_image_state").upsert(row, { onConflict: "project_id,image_id" })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Resolve the project's "state anchor" image — the image row id under
 * which `project_image_state` is keyed.
 *
 * Returns the working_copy.id (= the editable surface, post refactor).
 * For legacy projects that don't have a working_copy yet (= created
 * before the eager-working-copy upload change), falls back to master.id
 * so the existing state row is still found. The follow-up migration
 * backfills working_copy rows for these legacy projects, after which
 * the fallback path is no longer hit.
 */
export async function resolveStateAnchorImage(
  supabase: SupabaseClient,
  projectId: string,
): Promise<{ id: string; is_locked: boolean } | { error: string } | { notFound: true }> {
  const { data: workingCopy, error: wcErr } = await supabase
    .from("project_images")
    .select("id,is_locked")
    .eq("project_id", projectId)
    .eq("kind", "working_copy")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (wcErr) return { error: wcErr.message }
  if (workingCopy?.id) {
    return { id: String(workingCopy.id), is_locked: Boolean(workingCopy.is_locked) }
  }

  // Legacy fallback: project has master but no working_copy.
  const { data: master, error: masterErr } = await supabase
    .from("project_images")
    .select("id,is_locked")
    .eq("project_id", projectId)
    .eq("kind", "master")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (masterErr) return { error: masterErr.message }
  if (master?.id) {
    return { id: String(master.id), is_locked: Boolean(master.is_locked) }
  }
  return { notFound: true }
}
