/**
 * Integration test: project_image_trace round-trip (F21 PR 1).
 *
 * The Trace surface is mutually exclusive — one row per project,
 * `kind` constrained to {pixelate, lineart}, `output_image_id`
 * referencing `project_images`. This test proves the schema
 * invariants directly via the supabase-js client; the full
 * apply/clear pipeline (which calls the Python filter service)
 * is exercised by Trace UI smoke testing once F21 PR 2 lands.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

import {
  cleanupProject,
  getServiceClient,
  seedImage,
  seedProject,
} from "./_setup"

describe("project_image_trace round-trip", () => {
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

  it("upserts a single trace row per project and rejects unknown kinds", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId

    const master = await seedImage({ supabase, projectId, kind: "master" })
    const pixelateOut = await seedImage({
      supabase,
      projectId,
      kind: "trace_output",
      sourceImageId: master.imageId,
    })
    const lineartOut = await seedImage({
      supabase,
      projectId,
      kind: "trace_output",
      sourceImageId: master.imageId,
    })

    // 1. Insert pixelate trace.
    const { error: insertErr } = await supabase
      .from("project_image_trace")
      .insert({
        project_id: projectId,
        kind: "pixelate",
        params: { supercell_mm: 6, num_colors: 16 },
        output_image_id: pixelateOut.imageId,
      })
    expect(insertErr).toBeNull()

    // 2. Read back: exactly one row, with the inserted kind.
    const { data: afterInsert } = await supabase
      .from("project_image_trace")
      .select("project_id,kind,params,output_image_id")
      .eq("project_id", projectId)

    expect(afterInsert).toHaveLength(1)
    expect(afterInsert?.[0]).toMatchObject({
      project_id: projectId,
      kind: "pixelate",
      output_image_id: pixelateOut.imageId,
    })

    // 3. Upsert lineart on the same project — replaces, not stacks.
    const { error: upsertErr } = await supabase
      .from("project_image_trace")
      .upsert(
        {
          project_id: projectId,
          kind: "lineart",
          params: { line_thickness: 3 },
          output_image_id: lineartOut.imageId,
        },
        { onConflict: "project_id" },
      )
    expect(upsertErr).toBeNull()

    const { data: afterUpsert } = await supabase
      .from("project_image_trace")
      .select("project_id,kind,output_image_id")
      .eq("project_id", projectId)

    expect(afterUpsert).toHaveLength(1)
    expect(afterUpsert?.[0]).toMatchObject({
      kind: "lineart",
      output_image_id: lineartOut.imageId,
    })

    // 4. Unknown kind rejected by CHECK constraint.
    const { error: badKindErr } = await supabase.from("project_image_trace").upsert(
      {
        project_id: projectId,
        kind: "bogus_kind",
        params: {},
        output_image_id: master.imageId,
      },
      { onConflict: "project_id" },
    )
    expect(badKindErr).not.toBeNull()
    // Postgres CHECK violations report SQLSTATE 23514.
    expect(String((badKindErr as { code?: string } | null)?.code ?? "")).toBe("23514")

    // 5. DELETE clears the row; no leftovers.
    const { error: deleteErr } = await supabase
      .from("project_image_trace")
      .delete()
      .eq("project_id", projectId)
    expect(deleteErr).toBeNull()

    const { data: afterDelete } = await supabase
      .from("project_image_trace")
      .select("project_id")
      .eq("project_id", projectId)
    expect(afterDelete).toEqual([])
  })

  it("ON DELETE CASCADE removes the trace row when its output image is deleted", async () => {
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

    await supabase.from("project_image_trace").insert({
      project_id: projectId,
      kind: "pixelate",
      params: {},
      output_image_id: traceOut.imageId,
    })

    const { error: imageDeleteErr } = await supabase
      .from("project_images")
      .delete()
      .eq("id", traceOut.imageId)

    expect(imageDeleteErr).toBeNull()

    const { data: traceAfter } = await supabase
      .from("project_image_trace")
      .select("project_id")
      .eq("project_id", projectId)
    expect(traceAfter).toEqual([])
  })
})
