import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { computeImagePlacementPx } from "@/lib/editor/image-placement"
import { GEOMETRY_PPI, pxUToPxNumber } from "@/lib/editor/units"

/**
 * Shared master-image display-state resolver for trace handlers.
 *
 * Every trace (pixelate, circulate, …) sizes its grid in display-mm — what
 * the user sees on the artboard is what they get — and freezes the master's
 * display rect (µpx) onto its `project_image_trace` row so the overlay renders
 * decoupled from the live canvas transform (Invariant 2). Both reads come
 * from the SAME authoritative DB lookup, here, so the geometry stays
 * byte-consistent across traces.
 */

const MM_PER_INCH = 25.4

function pxToMm(px: number): number {
  return (px / GEOMETRY_PPI) * MM_PER_INCH
}

function parsePxU(value: unknown): bigint | null {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    const v = BigInt(value)
    return v > 0n ? v : null
  } catch {
    return null
  }
}

/** Master-image display state on the artboard, in mm + µpx.
 *
 * The grid is sized in display-mm; the trace's centred display rect needs the
 * master's x/y/w/h in µpx so we can shift the smaller trace into the master's
 * centre with one server-side computation. State preferred (after any
 * positioning the user did); fresh-upload fallback uses
 * `computeImagePlacementPx` and leaves x/y null (no persisted origin → trace
 * centres at 0n, the canvas's default paint origin). */
export type MasterStateOk = {
  ok: true
  displayMmW: number
  displayMmH: number
  xPxU: bigint | null
  yPxU: bigint | null
  widthPxU: bigint
  heightPxU: bigint
}

export async function resolveMasterState(args: {
  supabase: SupabaseClient<Database>
  projectId: string
}): Promise<MasterStateOk | { ok: false; reason: string }> {
  const { supabase, projectId } = args
  const { data: workspace } = await supabase
    .from("project_workspace")
    .select("width_px_u,height_px_u")
    .eq("project_id", projectId)
    .maybeSingle()
  if (!workspace) {
    return { ok: false, reason: "Project workspace is missing" }
  }

  const { data: master } = await supabase
    .from("project_images")
    .select("id,width_px,height_px,dpi")
    .eq("project_id", projectId)
    .eq("kind", "master")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!master?.id) {
    return { ok: false, reason: "Project has no master image" }
  }

  // State is anchored at working_copy.id post the working-copy refactor
  // (PR #257). Read state row keyed there; if no working_copy or no
  // state row exists, fall back to the intrinsic-based default
  // placement below (= fresh-upload behaviour).
  const { data: workingCopy } = await supabase
    .from("project_images")
    .select("id")
    .eq("project_id", projectId)
    .eq("kind", "working_copy")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const stateAnchorId = workingCopy?.id ?? null
  const { data: state } = stateAnchorId
    ? await supabase
        .from("project_image_state")
        .select("x_px_u,y_px_u,width_px_u,height_px_u")
        .eq("project_id", projectId)
        .eq("image_id", stateAnchorId)
        .maybeSingle()
    : { data: null }

  const stateW = parsePxU(state?.width_px_u)
  const stateH = parsePxU(state?.height_px_u)
  if (stateW && stateH) {
    return {
      ok: true,
      displayMmW: pxToMm(pxUToPxNumber(stateW)),
      displayMmH: pxToMm(pxUToPxNumber(stateH)),
      xPxU: parsePxU(state?.x_px_u),
      yPxU: parsePxU(state?.y_px_u),
      widthPxU: stateW,
      heightPxU: stateH,
    }
  }

  // Fresh-upload fallback: use the same placement the Master-Upload
  // flow uses to seed initial state. Keeps the wizard bedienbar
  // without requiring the user to manually position first.
  const artWPxU = parsePxU(workspace.width_px_u)
  const artHPxU = parsePxU(workspace.height_px_u)
  if (!artWPxU || !artHPxU) {
    return { ok: false, reason: "Workspace size missing (width_px_u/height_px_u)" }
  }
  const placement = computeImagePlacementPx({
    artW: pxUToPxNumber(artWPxU),
    artH: pxUToPxNumber(artHPxU),
    intrinsicW: Number(master.width_px ?? 0),
    intrinsicH: Number(master.height_px ?? 0),
    imageDpi: master.dpi == null ? null : Number(master.dpi),
  })
  if (!placement) {
    return { ok: false, reason: "Could not derive initial placement for master" }
  }
  return {
    ok: true,
    displayMmW: pxToMm(placement.widthPx),
    displayMmH: pxToMm(placement.heightPx),
    xPxU: null,
    yPxU: null,
    widthPxU: BigInt(Math.round(placement.widthPx * 1_000_000)),
    heightPxU: BigInt(Math.round(placement.heightPx * 1_000_000)),
  }
}
