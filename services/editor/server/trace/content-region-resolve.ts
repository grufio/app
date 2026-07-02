import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { GEOMETRY_PPI, pxUToPxNumber } from "@/lib/editor/units"
import { normalizeWorkspacePadding } from "@/services/editor/padding"

import { computeContentRegionPlan, type ContentRegionPlan } from "@/lib/editor/trace/content-region"
import { resolveMasterState } from "./master-state"

const MM_PER_INCH = 25.4
const PX_U = 1_000_000

function pxToMm(px: number): number {
  return (px / GEOMETRY_PPI) * MM_PER_INCH
}
function toPxU(px: number): bigint {
  return BigInt(Math.round(px * PX_U))
}
function parsePxU(value: unknown): bigint | null {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    return BigInt(value)
  } catch {
    return null
  }
}

/**
 * Resolve the trace content region for a source image: the content rect
 * (artboard − padding) mapped against the image's placement, plus the
 * compositing plan (white-fill where uncovered), the content-rect display size
 * (mm, for grid sizing) and the content-rect display rect (µpx, for the trace's
 * frozen overlay). The traced region is ALWAYS the full content rect.
 */
export async function resolveTraceContentRegion(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  intrinsicWPx: number
  intrinsicHPx: number
}): Promise<
  | {
      ok: true
      plan: Extract<ContentRegionPlan, { ok: true }>
      displayMmW: number
      displayMmH: number
      displayRectPxU: { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint }
    }
  | { ok: false; reason: string }
> {
  const { supabase, projectId, intrinsicWPx, intrinsicHPx } = args

  const { data: ws } = await supabase
    .from("project_workspace")
    .select("width_px_u,height_px_u,padding_top_px_u,padding_bottom_px_u,padding_left_px_u,padding_right_px_u")
    .eq("project_id", projectId)
    .maybeSingle()
  if (!ws) return { ok: false, reason: "Project workspace is missing" }
  const artWPxU = parsePxU(ws.width_px_u)
  const artHPxU = parsePxU(ws.height_px_u)
  if (!artWPxU || !artHPxU) return { ok: false, reason: "Workspace size missing (width_px_u/height_px_u)" }
  const artboardWPx = pxUToPxNumber(artWPxU)
  const artboardHPx = pxUToPxNumber(artHPxU)

  const pad = normalizeWorkspacePadding(ws as unknown as Parameters<typeof normalizeWorkspacePadding>[0])
  const padding = {
    topPx: pxUToPxNumber(BigInt(pad.topPxU)),
    bottomPx: pxUToPxNumber(BigInt(pad.bottomPxU)),
    leftPx: pxUToPxNumber(BigInt(pad.leftPxU)),
    rightPx: pxUToPxNumber(BigInt(pad.rightPxU)),
  }

  // Image placement on the artboard (display size + centre). Null origin =
  // centred on the artboard (matches `computeImagePlacementPx`).
  const master = await resolveMasterState({ supabase, projectId })
  if (!master.ok) return { ok: false, reason: master.reason }
  const dw = pxUToPxNumber(master.widthPxU)
  const dh = pxUToPxNumber(master.heightPxU)
  const cx = master.xPxU != null ? pxUToPxNumber(master.xPxU) : artboardWPx / 2
  const cy = master.yPxU != null ? pxUToPxNumber(master.yPxU) : artboardHPx / 2
  const image = { leftPx: cx - dw / 2, topPx: cy - dh / 2, widthPx: dw, heightPx: dh }

  const plan = computeContentRegionPlan({ artboardWPx, artboardHPx, padding, image, intrinsicWPx, intrinsicHPx })
  if (!plan.ok) return { ok: false, reason: plan.reason }

  const c = plan.contentRectPx
  return {
    ok: true,
    plan,
    displayMmW: pxToMm(c.widthPx),
    displayMmH: pxToMm(c.heightPx),
    displayRectPxU: {
      xPxU: toPxU(c.xPx),
      yPxU: toPxU(c.yPx),
      widthPxU: toPxU(c.widthPx),
      heightPxU: toPxU(c.heightPx),
    },
  }
}
