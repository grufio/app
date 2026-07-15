import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"
import { SIGNED_URL_TTL } from "@/lib/storage/signed-url-ttl"
import { resetProjectFilterChain } from "@/services/editor/server/filter-chain-reset"
import { ensureWorkingCopyExists } from "@/services/editor/server/working-copy/ensure"

import { parseFilterType } from "./parse-filter-type"
import { resolveTraceDisplay } from "./resolve-trace-display"
import type { FilterPanelDataResult, FilterPanelDisplay, FilterPanelStackItem } from "./types"

/**
 * Resolve the filter-panel's display source row without materialising
 * a `filter_working_copy` on the fly.
 *
 * Preference order:
 *   1. Newest `filter_working_copy` for the project (legacy:
 *      existing chain or pre-lazy-refactor projects).
 *   2. Newest `working_copy`. If none exists yet (lazy-working-copy
 *      lifecycle), materialise it via `ensureWorkingCopyExists`,
 *      then re-read it.
 *
 * The `working_copy` route is the new default for fresh projects:
 * filter chain only materialises a `filter_working_copy` on first
 * `applyFilter`, so most projects never see one.
 */
async function resolveFilterPanelSource(args: {
  supabase: SupabaseClient<Database>
  projectId: string
}): Promise<
  | {
      ok: true
      id: string
      storagePath: string
      widthPx: number
      heightPx: number
      signedUrl: string
      sourceImageId: string | null
      name: string
    }
  | {
      ok: false
      status: number
      stage: "filter_source_lookup" | "no_active_image" | "active_lookup"
      reason: string
      code?: string
    }
> {
  const { supabase, projectId } = args

  const { data: filterCopies, error: filterCopyErr } = await supabase
    .from("project_images")
    .select("id,name,storage_bucket,storage_path,width_px,height_px,source_image_id")
    .eq("project_id", projectId)
    .eq("kind", "filter_working_copy")
    .like("name", "%(filter working)")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)

  if (filterCopyErr) {
    return {
      ok: false,
      status: 400,
      stage: "filter_source_lookup",
      reason: filterCopyErr.message,
      code: (filterCopyErr as { code?: string }).code,
    }
  }

  const existingFilterCopy = (filterCopies ?? [])[0] ?? null
  if (existingFilterCopy) {
    const { data: signedData } = await supabase.storage
      .from(String(existingFilterCopy.storage_bucket ?? PROJECT_IMAGES_BUCKET))
      .createSignedUrl(String(existingFilterCopy.storage_path), SIGNED_URL_TTL.filterWorkingCopy)
    return {
      ok: true,
      id: String(existingFilterCopy.id),
      storagePath: String(existingFilterCopy.storage_path),
      widthPx: Number(existingFilterCopy.width_px),
      heightPx: Number(existingFilterCopy.height_px),
      signedUrl: signedData?.signedUrl ?? "",
      sourceImageId: existingFilterCopy.source_image_id ? String(existingFilterCopy.source_image_id) : null,
      name: String(existingFilterCopy.name).replace(/ \(filter working\)$/, ""),
    }
  }

  // No filter_working_copy yet — fall back to working_copy.
  const { data: workingCopies, error: workingCopyErr } = await supabase
    .from("project_images")
    .select("id,name,storage_bucket,storage_path,width_px,height_px,source_image_id")
    .eq("project_id", projectId)
    .eq("kind", "working_copy")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)

  if (workingCopyErr) {
    return {
      ok: false,
      status: 400,
      stage: "filter_source_lookup",
      reason: workingCopyErr.message,
      code: (workingCopyErr as { code?: string }).code,
    }
  }

  let workingCopy = (workingCopies ?? [])[0] ?? null

  // Lazy working_copy: master uploads no longer auto-create one. If
  // there's a master but no working_copy yet, materialise it via
  // the canonical helper, then re-read.
  if (!workingCopy) {
    const ensured = await ensureWorkingCopyExists({ supabase, projectId })
    if (!ensured.ok) {
      if (ensured.stage === "no_master") {
        return { ok: false, status: 404, stage: "no_active_image", reason: ensured.reason }
      }
      return { ok: false, status: 500, stage: "active_lookup", reason: ensured.reason, code: ensured.code }
    }
    const reRead = await supabase
      .from("project_images")
      .select("id,name,storage_bucket,storage_path,width_px,height_px,source_image_id")
      .eq("project_id", projectId)
      .eq("id", ensured.imageId)
      .is("deleted_at", null)
      .limit(1)
    if (reRead.error || !reRead.data || reRead.data.length === 0) {
      return {
        ok: false,
        status: 500,
        stage: "active_lookup",
        reason: reRead.error?.message ?? "Working-copy ensure succeeded but re-read failed",
      }
    }
    workingCopy = reRead.data[0]
  }

  const { data: signedData } = await supabase.storage
    .from(String(workingCopy.storage_bucket ?? PROJECT_IMAGES_BUCKET))
    .createSignedUrl(String(workingCopy.storage_path), SIGNED_URL_TTL.filterWorkingCopy)
  return {
    ok: true,
    id: String(workingCopy.id),
    storagePath: String(workingCopy.storage_path),
    widthPx: Number(workingCopy.width_px),
    heightPx: Number(workingCopy.height_px),
    signedUrl: signedData?.signedUrl ?? "",
    sourceImageId: workingCopy.source_image_id ? String(workingCopy.source_image_id) : null,
    name: String(workingCopy.name).replace(/ \(working copy\)$/, ""),
  }
}

export async function getFilterPanelData(args: {
  supabase: SupabaseClient<Database>
  projectId: string
}): Promise<FilterPanelDataResult> {
  const { supabase, projectId } = args
  const working = await resolveFilterPanelSource({ supabase, projectId })
  if (!working.ok) return working

  const { data: filterRows, error: filterErr } = await supabase
    .from("project_image_filters")
    .select("id,input_image_id,output_image_id,filter_type")
    .eq("project_id", projectId)

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
  // SVG); applying pixelate or linerate means "show me this", not
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
