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
 *
 * Also exercises `resetProjectFilterChain` end-to-end: unit tests
 * already cover its branches against a mocked client, but the
 * integration pass here proves it actually deletes the rows and
 * tombstones the output images on a real database — which is the
 * safety-net the upcoming filter-pipeline refactor (PR 4/5) needs.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { resetProjectFilterChain } from "@/services/editor/server/filter-chain-reset"

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

    const append = async (input: string, output: string, type: "pixelate") => {
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
    const f2 = await append(out1.imageId, out2.imageId, "pixelate")
    const f3 = await append(out2.imageId, out3.imageId, "pixelate")

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

  it("removes the head filter and rewires the tail to read from master", async () => {
    // Removing the head is the case that the production code's RPC has
    // to renumber AND rewire the next filter's input — without an
    // explicit rewire entry the chain (master → out1 → out2) leaves
    // f2.input_image_id pointing at the soft-deleted out1, breaking the
    // tip-continuity invariant. The middle-removal case is covered
    // above; this test catches regressions in the head-of-chain path.
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId

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

    const append = async (input: string, output: string, type: "pixelate") => {
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
    const f2 = await append(out1.imageId, out2.imageId, "pixelate")

    const { error: removeErr } = await supabase.rpc("remove_project_image_filter", {
      p_project_id: projectId!,
      p_filter_id: f1,
      p_rewires: [{ id: f2, input_image_id: master.imageId, output_image_id: out2.imageId }],
    })
    expect(removeErr).toBeNull()

    const { data: chain } = await supabase
      .from("project_image_filters")
      .select("id, stack_order, input_image_id, output_image_id")
      .eq("project_id", projectId)
      .order("stack_order", { ascending: true })

    expect(chain).toEqual([
      {
        id: f2,
        stack_order: 1,
        input_image_id: master.imageId,
        output_image_id: out2.imageId,
      },
    ])
  })

  it("resetProjectFilterChain clears every filter row and tombstones outputs", async () => {
    // End-to-end exercise of the reset path: unit tests mock the
    // Supabase client, this one asserts the real behaviour against a
    // live database. PR 4/5 refactors the per-filter server pipelines
    // and this case ensures the reset semantics survive the change.
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId

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

    const append = async (input: string, output: string) => {
      const { data, error } = await supabase.rpc("append_project_image_filter", {
        p_project_id: projectId!,
        p_input_image_id: input,
        p_output_image_id: output,
        p_filter_type: "pixelate",
      })
      expect(error).toBeNull()
      return data as string
    }

    await append(master.imageId, out1.imageId)
    await append(out1.imageId, out2.imageId)

    const result = await resetProjectFilterChain({ supabase, projectId: projectId! })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.deletedFilterRows).toBe(2)
      expect(result.softDeletedOutputs).toBe(2)
    }

    const { data: chain } = await supabase
      .from("project_image_filters")
      .select("id")
      .eq("project_id", projectId)
    expect(chain ?? []).toEqual([])

    // Output images are tombstoned (deleted_at set) but rows still
    // exist for audit; master is untouched.
    const { data: images } = await supabase
      .from("project_images")
      .select("id, kind, deleted_at")
      .eq("project_id", projectId)
      .order("kind", { ascending: true })

    const masterRow = images?.find((r) => r.kind === "master")
    const outputs = images?.filter((r) => r.kind === "filter_working_copy") ?? []
    expect(masterRow?.deleted_at).toBeNull()
    expect(outputs).toHaveLength(2)
    for (const o of outputs) {
      expect(o.deleted_at).not.toBeNull()
    }
  })

  it("resetProjectFilterChain on an empty chain is a no-op", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId

    const result = await resetProjectFilterChain({ supabase, projectId: projectId! })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.deletedFilterRows).toBe(0)
      expect(result.softDeletedOutputs).toBe(0)
    }
  })
})
