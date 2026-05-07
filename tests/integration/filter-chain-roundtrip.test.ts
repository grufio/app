/**
 * Integration test: append + remove filter round-trip.
 *
 * Validates the two RPCs that maintain the per-project filter chain:
 *
 *   - `append_project_image_filter` enforces tip-continuity (the new
 *     filter's input must equal the previous filter's output) and
 *     assigns the next stack_order.
 *   - `remove_project_image_filter` deletes a filter, optionally
 *     rewires neighbours (input/output adjustments passed as JSONB),
 *     and renumbers the remaining stack_order values 1..N.
 *
 * If either RPC drifts off-spec — wrong order, gaps in stack_order,
 * accepts an invalid tip — this test catches it.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  cleanupProject,
  getServiceClient,
  seedImage,
  seedProject,
} from "./_setup"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

describe("filter chain round-trip", () => {
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

  it("appends three filters in order and renumbers after removal", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId

    // Master + 3 outputs (one per filter step).
    const master = await seedImage({ supabase, projectId, kind: "master" })
    const out1 = await seedImage({
      supabase,
      projectId,
      kind: "filter_working_copy",
      sourceImageId: master.imageId,
    })
    const out2 = await seedImage({
      supabase,
      projectId,
      kind: "filter_working_copy",
      sourceImageId: out1.imageId,
    })
    const out3 = await seedImage({
      supabase,
      projectId,
      kind: "filter_working_copy",
      sourceImageId: out2.imageId,
    })

    const append = async (input: string, output: string, type: "pixelate" | "lineart" | "numerate") => {
      const { data, error } = await supabase.rpc("append_project_image_filter", {
        p_project_id: projectId!,
        p_input_image_id: input,
        p_output_image_id: output,
        p_filter_type: type,
      })
      expect(error).toBeNull()
      return data as string
    }

    const f1 = await append(master.imageId, out1.imageId, "pixelate")
    const f2 = await append(out1.imageId, out2.imageId, "lineart")
    const f3 = await append(out2.imageId, out3.imageId, "numerate")

    const { data: chain } = await supabase
      .from("project_image_filters")
      .select("id, stack_order")
      .eq("project_id", projectId)
      .order("stack_order", { ascending: true })

    expect(chain).toEqual([
      { id: f1, stack_order: 1 },
      { id: f2, stack_order: 2 },
      { id: f3, stack_order: 3 },
    ])

    // Tip-continuity guard: appending with a stale tip must fail.
    const { error: tipErr } = await supabase.rpc("append_project_image_filter", {
      p_project_id: projectId!,
      p_input_image_id: master.imageId, // wrong — tip is out3
      p_output_image_id: out3.imageId,
      p_filter_type: "pixelate",
    })
    expect(tipErr).not.toBeNull()
    expect(String(tipErr?.message ?? "")).toMatch(/tip mismatch/i)

    // Remove the middle filter and rewire f3.input from out2 → out1 so
    // the remaining chain stays valid (master → out1 → out3).
    const { error: removeErr } = await supabase.rpc("remove_project_image_filter", {
      p_project_id: projectId!,
      p_filter_id: f2,
      p_rewires: [{ id: f3, input_image_id: out1.imageId, output_image_id: out3.imageId }],
    })
    expect(removeErr).toBeNull()

    const { data: renumbered } = await supabase
      .from("project_image_filters")
      .select("id, stack_order, input_image_id, output_image_id")
      .eq("project_id", projectId)
      .order("stack_order", { ascending: true })

    expect(renumbered).toEqual([
      {
        id: f1,
        stack_order: 1,
        input_image_id: master.imageId,
        output_image_id: out1.imageId,
      },
      {
        id: f3,
        stack_order: 2,
        input_image_id: out1.imageId,
        output_image_id: out3.imageId,
      },
    ])
  })
})
