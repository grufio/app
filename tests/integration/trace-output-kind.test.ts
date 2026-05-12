/**
 * Integration test: `kind='trace_output'` separates trace SVGs from
 * the filter chain. Before this refactor both shared
 * `filter_working_copy`, which made editor-target resolution pick
 * the SVG over the raster chain tip when it was newer.
 *
 * Asserts the contract the refactor codifies:
 *  - a trace row can be inserted with kind='trace_output'
 *  - resolveEditorTargetImageRows picks the filter chain tip,
 *    not the trace_output, when both exist
 *
 * The backfill migration (UPDATE keyed off
 * project_image_trace.output_image_id) is asserted by the deploy
 * gate, not here — a migration applied to the test DB is the
 * precondition for these tests passing at all.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { resolveEditorTargetImageRows } from "@/lib/supabase/project-images"

import {
  cleanupProject,
  getServiceClient,
  seedImage,
  seedProject,
} from "./_setup"

describe("trace_output kind", () => {
  let supabase: SupabaseClient<Database>

  beforeAll(() => {
    supabase = getServiceClient()
  })

  let projectId: string | null = null
  let ownerId: string | null = null

  afterEach(async () => {
    if (projectId && ownerId) {
      await cleanupProject({ supabase, projectId, ownerId })
    }
    projectId = null
    ownerId = null
  })

  it("accepts kind='trace_output' on project_images", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId

    const master = await seedImage({ supabase, projectId, kind: "master" })
    const traceOut = await seedImage({
      supabase,
      projectId,
      kind: "trace_output",
      sourceImageId: master.imageId,
    })

    const { data } = await supabase
      .from("project_images")
      .select("kind")
      .eq("id", traceOut.imageId)
      .maybeSingle()

    expect(data?.kind).toBe("trace_output")
  })

  it("resolveEditorTargetImageRows ignores trace_output and picks the filter chain tip", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId

    const master = await seedImage({ supabase, projectId, kind: "master" })
    const workingCopy = await seedImage({
      supabase,
      projectId,
      kind: "filter_working_copy",
      sourceImageId: master.imageId,
      name: "img (filter working)",
    })
    const filterTip = await seedImage({
      supabase,
      projectId,
      kind: "filter_working_copy",
      sourceImageId: workingCopy.imageId,
      name: "img (pixelate)",
    })
    // Seed the trace_output AFTER the filter tip so its created_at is
    // strictly newer. Pre-refactor the resolver picked newest
    // filter_working_copy by timestamp and would have returned the
    // trace row; with the new kind it falls through.
    await seedImage({
      supabase,
      projectId,
      kind: "trace_output",
      sourceImageId: filterTip.imageId,
      name: "img (numerate)",
    })

    const result = await resolveEditorTargetImageRows(supabase, projectId)
    expect(result.error).toBeNull()
    expect(result.target?.id).toBe(filterTip.imageId)
  })

})
