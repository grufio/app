import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"
import { SIGNED_URL_TTL } from "@/lib/storage/signed-url-ttl"
import { resetProjectFilterChain } from "@/services/editor/server/filter-chain-reset"

import { getOrCreateFilterWorkingCopy } from "./get-or-create"
import { parseFilterType } from "./parse-filter-type"
import { resolveTraceDisplay } from "./resolve-trace-display"
import type { FilterPanelDataResult, FilterPanelDisplay, FilterPanelStackItem } from "./types"

export async function getFilterPanelData(args: {
  supabase: SupabaseClient<Database>
  projectId: string
}): Promise<FilterPanelDataResult> {
  const { supabase, projectId } = args
  const working = await getOrCreateFilterWorkingCopy({ supabase, projectId })
  if (!working.ok) return working

  const { data: filterRows, error: filterErr } = await supabase
    .from("project_image_filters")
    .select("id,input_image_id,output_image_id,filter_type,stack_order,is_hidden")
    .eq("project_id", projectId)
    .order("stack_order", { ascending: true })

  if (filterErr) {
    return {
      ok: false,
      status: 400,
      stage: "filter_rows_query",
      reason: filterErr.message,
      code: filterErr.code,
    }
  }

  const displayFromWorking = {
    id: working.id,
    storagePath: working.storagePath,
    widthPx: working.widthPx,
    heightPx: working.heightPx,
    signedUrl: working.signedUrl,
    sourceImageId: working.sourceImageId,
    name: working.name,
    isFilterResult: false,
  }

  // Trace overrides the filter chain tip as the displayed canvas
  // image. Trace is the final product artefact (paint-by-numbers
  // SVG); applying numerate or lineart means "show me this", not
  // "stack this on top of pixelate". Filter chain is still
  // returned in `stack` so the Filter sidebar reflects pixelate
  // history.
  const traceDisplay = await resolveTraceDisplay({ supabase, projectId })
  const baseDisplay = traceDisplay ?? displayFromWorking

  if (!(filterRows ?? []).length) {
    return {
      ok: true,
      display: baseDisplay,
      displayWithoutTrace: displayFromWorking,
      stack: [],
    }
  }

  const chain: Array<{
    id: string
    input_image_id: string
    output_image_id: string
    filter_type: string
    is_hidden: boolean
  }> = []
  let cursorImageId = working.id
  for (const row of filterRows ?? []) {
    const input = String(row.input_image_id ?? "")
    const output = String(row.output_image_id ?? "")
    if (!input || !output) continue
    if (input !== cursorImageId) continue
    chain.push({
      id: String(row.id),
      input_image_id: input,
      output_image_id: output,
      filter_type: String(row.filter_type ?? ""),
      is_hidden: Boolean(row.is_hidden),
    })
    cursorImageId = output
  }

  if (!chain.length) {
    if ((filterRows ?? []).length > 0) {
      console.warn("[filter-working-copy] orphaned chain detected, auto-resetting", {
        projectId,
        workingCopyId: working.id,
        orphanCount: filterRows?.length ?? 0,
      })
      const reset = await resetProjectFilterChain({ supabase, projectId })
      if (!reset.ok) {
        return { ok: false, status: 500, stage: "chain_invalid", reason: reset.reason, code: reset.code }
      }
    }
    return {
      ok: true,
      display: displayFromWorking,
      displayWithoutTrace: displayFromWorking,
      stack: [],
    }
  }

  const chainRowIds = new Set(chain.map((node) => node.id))
  const hasDisconnectedRows = (filterRows ?? []).some((row) => !chainRowIds.has(String(row.id)))
  if (hasDisconnectedRows) {
    console.warn("[filter-working-copy] disconnected chain segments detected, auto-resetting", {
      projectId,
      workingCopyId: working.id,
      orphanCount: (filterRows ?? []).length - chain.length,
    })
    const reset = await resetProjectFilterChain({ supabase, projectId })
    if (!reset.ok) {
      return { ok: false, status: 500, stage: "chain_invalid", reason: reset.reason, code: reset.code }
    }
    return {
      ok: true,
      display: displayFromWorking,
      displayWithoutTrace: displayFromWorking,
      stack: [],
    }
  }

  const outputImageIds = chain.map((row) => row.output_image_id)
  const { data: images, error } = await supabase
    .from("project_images")
    .select("id,name,storage_bucket,storage_path,width_px,height_px,source_image_id")
    .eq("project_id", projectId)
    .eq("kind", "filter_working_copy")
    .in("id", outputImageIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (error) {
    return {
      ok: false,
      status: 400,
      stage: "filter_output_query",
      reason: error.message,
      code: error.code,
    }
  }

  const imageById = new Map((images ?? []).map((row) => [row.id, row]))
  const stack: FilterPanelStackItem[] = []
  for (const node of chain) {
    const image = imageById.get(node.output_image_id)
    if (!image) {
      return {
        ok: false,
        status: 409,
        stage: "filter_output_missing",
        reason: "Filter chain references a missing output image",
      }
    }
    stack.push({
      id: node.id,
      name: image.name,
      filterType: parseFilterType(node.filter_type),
      source_image_id: node.input_image_id,
      is_hidden: Boolean(node.is_hidden),
    })
  }

  const tipId = chain[chain.length - 1].output_image_id
  const tipImage = imageById.get(tipId)
  if (!tipImage) {
    return {
      ok: false,
      status: 409,
      stage: "filter_tip_missing",
      reason: "Filter chain tip is missing",
    }
  }
  const { data: signedData } = await supabase.storage
    .from(String(tipImage.storage_bucket ?? PROJECT_IMAGES_BUCKET))
    .createSignedUrl(String(tipImage.storage_path), SIGNED_URL_TTL.filterWorkingCopy)

  const filterTipDisplay: FilterPanelDisplay = {
    id: tipImage.id,
    storagePath: tipImage.storage_path,
    widthPx: tipImage.width_px,
    heightPx: tipImage.height_px,
    signedUrl: signedData?.signedUrl ?? "",
    sourceImageId: tipImage.source_image_id,
    name: tipImage.name,
    isFilterResult: true,
  }

  // Trace overrides the filter chain tip — see comment in
  // getFilterPanelData where `traceDisplay` is first computed.
  // `displayWithoutTrace` keeps the raster tip so the Filter tab
  // can show it even when a trace exists.
  const tipDisplay = traceDisplay ?? filterTipDisplay

  return {
    ok: true,
    display: tipDisplay,
    displayWithoutTrace: filterTipDisplay,
    stack,
  }
}
