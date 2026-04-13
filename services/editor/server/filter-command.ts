import type { SupabaseClient } from "@supabase/supabase-js"

import { appendProjectImageFilter, cleanupOrphanFilterImage } from "@/services/editor/server/filter-chain"

type FilterRunFailure = {
  ok: false
  status: number
  stage: string
  reason: string
  code?: string
}

type FilterRunSuccess = {
  ok: true
  id: string
  storagePath: string
  widthPx: number
  heightPx: number
}

type FilterRunResult = FilterRunFailure | FilterRunSuccess

export type ApplyFilterCommandResult =
  | FilterRunSuccess
  | {
      ok: false
      status: number
      stage: string
      reason: string
      code?: string
    }

/**
 * Runs a filter mutation, appends chain metadata, and performs orphan cleanup on chain failure.
 */
export async function applyFilterCommand(args: {
  supabase: SupabaseClient
  projectId: string
  sourceImageId: string
  filterType: "pixelate" | "numerate" | "lineart"
  filterParams: Record<string, unknown>
  runFilter: () => Promise<FilterRunResult>
}): Promise<ApplyFilterCommandResult> {
  const { supabase, projectId, sourceImageId, filterType, filterParams, runFilter } = args
  const result = await runFilter()
  if (!result.ok) return result

  const chain = await appendProjectImageFilter({
    supabase,
    projectId,
    inputImageId: sourceImageId,
    outputImageId: result.id,
    filterType,
    filterParams,
  })
  if (!chain.ok) {
    await cleanupOrphanFilterImage({
      supabase,
      projectId,
      imageId: result.id,
      storagePath: result.storagePath,
    })
    return { ok: false, status: 400, stage: "db_insert", reason: chain.reason, code: chain.code }
  }

  return result
}
