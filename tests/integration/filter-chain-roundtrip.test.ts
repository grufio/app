/**
 * Integration test: single-filter apply + remove round-trip.
 *
 * The editor is single-artifact: at most ONE filter per project, enforced by
 * `UNIQUE(project_id)` on `project_image_filters`. This validates:
 *
 *   - `append_project_image_filter` inserts the one filter.
 *   - a SECOND append for the same project is rejected (unique_violation 23505).
 *   - `remove_project_image_filter` deletes the filter row.
 *   - `resetProjectFilterChain` clears the filter row and tombstones its output.
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

describe("single-filter round-trip", () => {
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

  it("applies one filter, rejects a second, then removes it", async () => {
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

    const { data: f1, error: appendErr } = await supabase.rpc("append_project_image_filter", {
      p_project_id: projectId,
      p_input_image_id: master.imageId,
      p_output_image_id: out1.imageId,
      p_filter_type: "bw_hard",
    })
    expect(appendErr).toBeNull()
    expect(typeof f1).toBe("string")

    // Single-artifact: a second filter for the same project violates UNIQUE(project_id).
    const { error: dupErr } = await supabase.rpc("append_project_image_filter", {
      p_project_id: projectId,
      p_input_image_id: out1.imageId,
      p_output_image_id: out2.imageId,
      p_filter_type: "bw_hard",
    })
    expect(dupErr).not.toBeNull()
    expect(String((dupErr as { code?: string } | null)?.code ?? "")).toBe("23505")

    const { error: removeErr } = await supabase.rpc("remove_project_image_filter", {
      p_project_id: projectId,
      p_filter_id: f1 as string,
    })
    expect(removeErr).toBeNull()

    const { data: chain } = await supabase
      .from("project_image_filters")
      .select("id")
      .eq("project_id", projectId)
    expect(chain ?? []).toEqual([])
  })

  it("resetProjectFilterChain clears the filter row and tombstones its output", async () => {
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

    const { error: appendErr } = await supabase.rpc("append_project_image_filter", {
      p_project_id: projectId,
      p_input_image_id: master.imageId,
      p_output_image_id: out1.imageId,
      p_filter_type: "bw_hard",
    })
    expect(appendErr).toBeNull()

    const result = await resetProjectFilterChain({ supabase, projectId: projectId! })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.deletedFilterRows).toBe(1)
      expect(result.softDeletedOutputs).toBe(1)
    }

    const { data: chain } = await supabase
      .from("project_image_filters")
      .select("id")
      .eq("project_id", projectId)
    expect(chain ?? []).toEqual([])

    const { data: images } = await supabase
      .from("project_images")
      .select("id, kind, deleted_at")
      .eq("project_id", projectId)

    const masterRow = images?.find((r) => r.kind === "master")
    const outputs = images?.filter((r) => r.kind === "filter_working_copy") ?? []
    expect(masterRow?.deleted_at).toBeNull()
    expect(outputs).toHaveLength(1)
    expect(outputs[0]?.deleted_at).not.toBeNull()
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
