/**
 * Project image repository helpers.
 *
 * Responsibilities:
 * - Provide query helpers for active and editor-target image rows.
 * - Keep image-role semantics consistent across callsites.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { resolveImageKind } from "@/lib/editor/image-kind"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"

// Re-exported for backwards-compatibility with existing call sites that
// imported from this module. Canonical home is `@/lib/storage/buckets`.
export { PROJECT_IMAGES_BUCKET }

type RawProjectImageRow = Record<string, unknown> & {
  updated_at?: string | null
  created_at?: string | null
}

/**
 * Safely read `code` off a PostgrestError-shaped value. Supabase errors
 * have an optional string `code` (PG error code, e.g. `23514`), but the
 * library's exported type only declares `message`. Replaces repeated
 * unsafe type-escapes at the error-handling sites.
 */
function readErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code
    return typeof code === "string" ? code : undefined
  }
  return undefined
}

export type ActiveMasterImage = {
  id: string
  storagePath: string
  storageBucket: string
  name: string
  widthPx: number
  heightPx: number
}

export type ActiveProjectImageRow = {
  id: string
  name: string | null
  storage_bucket: string | null
  storage_path: string | null
  format: string | null
  width_px: number | null
  height_px: number | null
  file_size_bytes: number | null
  dpi: number | null
  source_image_id: string | null
  kind: string | null
}

function toActiveProjectImageRow(data: Record<string, unknown>): ActiveProjectImageRow | null {
  if (!data?.id) return null
  return {
    id: String(data.id),
    name: data.name == null ? null : String(data.name),
    storage_bucket: data.storage_bucket == null ? null : String(data.storage_bucket),
    storage_path: data.storage_path == null ? null : String(data.storage_path),
    format: data.format == null ? null : String(data.format),
    width_px: data.width_px == null ? null : Number(data.width_px),
    height_px: data.height_px == null ? null : Number(data.height_px),
    file_size_bytes: data.file_size_bytes == null ? null : Number(data.file_size_bytes),
    dpi: data.dpi == null ? null : Number(data.dpi),
    source_image_id: data.source_image_id == null ? null : String(data.source_image_id),
    kind: data.kind == null ? null : String(data.kind),
  }
}

function rowSortTs(row: RawProjectImageRow): number {
  const updatedTs = Date.parse(String(row.updated_at ?? ""))
  if (Number.isFinite(updatedTs)) return updatedTs
  const createdTs = Date.parse(String(row.created_at ?? ""))
  if (Number.isFinite(createdTs)) return createdTs
  return 0
}

/**
 * Resolve the editor's **display** image rows for a project.
 *
 * Returns two related rows:
 * - `target`: the image the canvas should render. Prefers a
 *   filter_working_copy (latest filter chain tip) over a plain
 *   working_copy. Used as the visual source for filter/trace previews.
 * - `preferredWorking`: the most recent plain working_copy, distinct
 *   from any filter_working_copy. Used as the fallback restore base
 *   when no filter chain has been applied.
 *
 * Important: state writes (`project_image_state`) do NOT use these
 * ids — they go to `master.id` resolved via
 * `getProjectMasterImageRow`. This function is exclusively about
 * canvas-display source selection.
 */
export async function resolveEditorTargetImageRows(
  supabase: SupabaseClient,
  projectId: string
): Promise<
  | {
      target: ActiveProjectImageRow | null
      preferredWorking: ActiveProjectImageRow | null
      error: null
    }
  | {
      target: null
      preferredWorking: null
      error: { stage: "active_lookup"; reason: string; code?: string }
    }
> {
  const { data, error } = await supabase
    .from("project_images")
    .select("id,name,storage_bucket,storage_path,format,width_px,height_px,file_size_bytes,dpi,source_image_id,kind,updated_at,created_at")
    .eq("project_id", projectId)
    .is("deleted_at", null)

  if (error) {
    return {
      target: null,
      preferredWorking: null,
      error: {
        stage: "active_lookup",
        reason: error.message,
        code: readErrorCode(error),
      },
    }
  }

  const sortedRows = [...((data ?? []) as RawProjectImageRow[])].sort((a, b) => rowSortTs(b) - rowSortTs(a))
  const rows = sortedRows
    .map((row) => toActiveProjectImageRow(row as unknown as Record<string, unknown>))
    .filter((row): row is ActiveProjectImageRow => Boolean(row))
  const filterTarget = rows.find((row) => resolveImageKind(row) === "filter_working_copy") ?? null
  const preferredWorking = rows.find((row) => resolveImageKind(row) === "working_copy") ?? null
  const target = filterTarget ?? preferredWorking ?? null
  return { target, preferredWorking, error: null }
}

export async function getEditorTargetImageRow(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ row: ActiveProjectImageRow | null; error: null } | { row: null; error: { stage: "active_lookup"; reason: string; code?: string } }> {
  const resolved = await resolveEditorTargetImageRows(supabase, projectId)
  if (resolved.error) return { row: null, error: resolved.error }
  return { row: resolved.target, error: null }
}

// Returns the project's `kind='master'` image id. This is the stable
// anchor for project_image_state persistence — every editor surface
// (working_copy, filter_working_copy, trace_output) resolves to this
// id when reading or writing the transform, so state survives any
// filter_working_copy recreation. See
// `supabase/migrations/20260512200000_image_state_anchor_at_master.sql`
// for the backfill that established this invariant.
export async function getProjectMasterImageId(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ masterId: string | null; error: string | null }> {
  const res = await getProjectMasterImageRow(supabase, projectId)
  if (res.error) return { masterId: null, error: res.error }
  return { masterId: res.row?.id ?? null, error: null }
}

export type ProjectMasterImageRow = {
  id: string
}

/**
 * Returns the project's master image row id in a single query.
 *
 * Used as the **persistence key resolution** for the master anchor.
 *
 * Selection rule: oldest (`created_at ASC`) non-deleted row with
 * `kind = 'master'`. Re-uploads create a new master and soft-delete
 * the old one, so "oldest live master" is unambiguous.
 *
 * Returns `{ row: null, error: null }` when no master exists (empty
 * editor / pre-upload).
 */
export async function getProjectMasterImageRow(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ row: ProjectMasterImageRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("project_images")
    .select("id")
    .eq("project_id", projectId)
    .eq("kind", "master")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) return { row: null, error: error.message }
  if (!data?.id) return { row: null, error: null }
  return {
    row: {
      id: String(data.id),
    },
    error: null,
  }
}

export type ProjectWorkspacePlacementRow = {
  width_px_u?: string | null
  height_px_u?: string | null
  width_px?: number | null
  height_px?: number | null
}

export async function getProjectWorkspacePlacementRow(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ row: ProjectWorkspacePlacementRow | null; error: null } | { row: null; error: { reason: string; code?: string } }> {
  const { data, error } = await supabase
    .from("project_workspace")
    .select("width_px_u,height_px_u,width_px,height_px")
    .eq("project_id", projectId)
    .maybeSingle()

  if (error) {
    return {
      row: null,
      error: {
        reason: error.message,
        code: readErrorCode(error),
      },
    }
  }
  if (!data) return { row: null, error: null }
  return { row: data as ProjectWorkspacePlacementRow, error: null }
}

export async function setActiveProjectImageState(args: {
  supabase: SupabaseClient
  projectId: string
  imageId: string
  xPxU: string
  yPxU: string
  widthPxU: string
  heightPxU: string
}): Promise<{ ok: true } | { ok: false; status: number; stage: "active_switch"; reason: string; code?: string }> {
  const { supabase, projectId, imageId, xPxU, yPxU, widthPxU, heightPxU } = args
  const { error } = await supabase.rpc("set_active_image_with_state", {
    p_project_id: projectId,
    p_image_id: imageId,
    p_x_px_u: xPxU,
    p_y_px_u: yPxU,
    p_width_px_u: widthPxU,
    p_height_px_u: heightPxU,
  })
  if (error) {
    return {
      ok: false,
      status: 400,
      stage: "active_switch",
      reason: error.message,
      code: readErrorCode(error),
    }
  }
  return { ok: true }
}

/**
 * Flip `is_active` for the given image without touching
 * `project_image_state`. Used by filter/trace/crop apply flows: those
 * produce a new display image (filter_working_copy / trace_output /
 * crop output), but state is anchored at working_copy.id (PR #257) and
 * stays untouched. Wraps the existing `set_active_image` RPC.
 */
export async function setActiveProjectImageOnly(args: {
  supabase: SupabaseClient
  projectId: string
  imageId: string
}): Promise<{ ok: true } | { ok: false; status: number; stage: "active_switch"; reason: string; code?: string }> {
  const { supabase, projectId, imageId } = args
  const { error } = await supabase.rpc("set_active_image", {
    p_project_id: projectId,
    p_image_id: imageId,
  })
  if (error) {
    return {
      ok: false,
      status: 400,
      stage: "active_switch",
      reason: error.message,
      code: readErrorCode(error),
    }
  }
  return { ok: true }
}

export async function getActiveMasterImage(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ image: ActiveMasterImage | null; error: string | null }> {
  const { data, error } = await supabase
    .from("project_images")
    .select("id,storage_path,storage_bucket,name,width_px,height_px,kind,is_active,deleted_at")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle()

  if (error) return { image: null, error: error.message }
  if (!data?.storage_path) return { image: null, error: null }

  const widthPxRaw = Number(data.width_px)
  const heightPxRaw = Number(data.height_px)
  const widthPx = Number.isFinite(widthPxRaw) ? widthPxRaw : 0
  const heightPx = Number.isFinite(heightPxRaw) ? heightPxRaw : 0

  return {
    image: {
      id: String(data.id ?? ""),
      storagePath: data.storage_path,
      storageBucket: data.storage_bucket ?? PROJECT_IMAGES_BUCKET,
      name: data.name ?? "master image",
      widthPx,
      heightPx,
    },
    error: null,
  }
}
