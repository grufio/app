import crypto from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { callFilterService, contentTypeFor, pickOutputFormat, startFilterProfiler, toInt, type FilterResult } from "./_helpers"
import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"

export type BwFilterResult = FilterResult<"bw_process">

/**
 * Shared pipeline for the three no-config black-and-white filters
 * (`bw_hard`, `bw_soft`, `bw_warm`). They differ only in which Python
 * filter-service route they call and the name-suffix on the derived
 * image — the lookup / lock-check / download / upload / DB-insert
 * steps are identical, so they share this core. The thin per-filter
 * exports below pin `servicePath` + `nameSuffix`.
 */
async function applyBwFilter(args: {
  supabase: SupabaseClient<Database>
  projectId: string
  sourceImageId: string
  servicePath: string
  nameSuffix: string
}): Promise<BwFilterResult> {
  const { supabase, projectId, sourceImageId, servicePath, nameSuffix } = args
  const profiler = startFilterProfiler()

  const { data: src, error: srcErr } = await supabase
    .from("project_images")
    .select("id,name,storage_bucket,storage_path,format,width_px,height_px")
    .eq("id", sourceImageId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle()
  profiler.mark("source_lookup")

  if (srcErr || !src) {
    return { ok: false, status: 404, stage: "source_lookup", reason: "Source image not found", code: srcErr?.code }
  }

  const origWidth = toInt(src.width_px)
  const origHeight = toInt(src.height_px)
  if (origWidth == null || origHeight == null || origWidth < 1 || origHeight < 1) {
    return { ok: false, status: 400, stage: "validation", reason: "Invalid source dimensions" }
  }

  const { data: srcBlob, error: downloadErr } = await supabase.storage
    .from(String(src.storage_bucket ?? PROJECT_IMAGES_BUCKET))
    .download(String(src.storage_path))

  if (downloadErr || !srcBlob) {
    return { ok: false, status: 500, stage: "source_download", reason: "Failed to download source image" }
  }

  const srcBuffer = Buffer.from(await srcBlob.arrayBuffer())
  profiler.mark("source_download")

  const outputFormat = pickOutputFormat(src.format)

  try {
    const imageBase64 = srcBuffer.toString("base64")
    profiler.mark("base64_encode")

    const callResult = await callFilterService({
      path: servicePath,
      body: { image_base64: imageBase64 },
    })
    profiler.mark("filter_service")

    if (!callResult.ok) {
      return {
        ok: false,
        status: callResult.status,
        stage:
          callResult.stage === "service_unavailable"
            ? "service_unavailable"
            : callResult.stage === "auth"
              ? "auth"
              : "bw_process",
        reason: callResult.reason,
      }
    }

    const outputBuffer = Buffer.from(callResult.bytes)

    const imageId = crypto.randomUUID()
    const objectPath = `projects/${projectId}/images/${imageId}`

    const { error: uploadErr } = await supabase.storage
      .from("project_images")
      .upload(objectPath, outputBuffer, {
        contentType: contentTypeFor(outputFormat),
        upsert: false,
      })

    if (uploadErr) {
      return { ok: false, status: 500, stage: "storage_upload", reason: "Failed to upload filtered image" }
    }
    profiler.mark("storage_upload")

    // Strip any known derived-image suffix before appending this
    // filter's own — keeps names from accreting "(B&W hard) (B&W soft)"
    // as filters stack.
    const baseName = src.name.replace(
      / \((?:filter working|pixelate|line art|numerate|B&W hard|B&W soft|B&W warm)\)/g,
      "",
    )

    const { error: insertErr } = await supabase.from("project_images").insert({
      id: imageId,
      project_id: projectId,
      kind: "filter_working_copy",
      name: `${baseName} ${nameSuffix}`,
      format: outputFormat,
      width_px: origWidth,
      height_px: origHeight,
      storage_bucket: PROJECT_IMAGES_BUCKET,
      storage_path: objectPath,
      file_size_bytes: outputBuffer.byteLength,
      is_active: false,
      source_image_id: sourceImageId,
    })

    if (insertErr) {
      await supabase.storage.from(PROJECT_IMAGES_BUCKET).remove([objectPath])
      return { ok: false, status: 400, stage: "db_insert", reason: insertErr.message, code: insertErr.code }
    }
    profiler.mark("db_insert")

    profiler.report(servicePath.replace("/filters/", ""), {
      python_phases: callResult.phases,
      output_bytes: outputBuffer.byteLength,
      width: origWidth,
      height: origHeight,
    })

    return {
      ok: true,
      id: imageId,
      storagePath: objectPath,
      widthPx: origWidth,
      heightPx: origHeight,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "B&W filter process failed"
    return { ok: false, status: 500, stage: "bw_process", reason: msg }
  }
}

type BwHandlerInput = {
  supabase: SupabaseClient<Database>
  projectId: string
  sourceImageId: string
  // Accepted for signature-compat with the FILTER_HANDLERS dispatch in
  // filter-variants.ts. B&W filters have an empty schema — no params.
  params: Record<string, unknown>
}

export function bwHardImageAndActivate(input: BwHandlerInput): Promise<BwFilterResult> {
  return applyBwFilter({
    supabase: input.supabase,
    projectId: input.projectId,
    sourceImageId: input.sourceImageId,
    servicePath: "/filters/bw_hard",
    nameSuffix: "(B&W hard)",
  })
}

export function bwSoftImageAndActivate(input: BwHandlerInput): Promise<BwFilterResult> {
  return applyBwFilter({
    supabase: input.supabase,
    projectId: input.projectId,
    sourceImageId: input.sourceImageId,
    servicePath: "/filters/bw_soft",
    nameSuffix: "(B&W soft)",
  })
}

export function bwWarmImageAndActivate(input: BwHandlerInput): Promise<BwFilterResult> {
  return applyBwFilter({
    supabase: input.supabase,
    projectId: input.projectId,
    sourceImageId: input.sourceImageId,
    servicePath: "/filters/bw_warm",
    nameSuffix: "(B&W warm)",
  })
}
