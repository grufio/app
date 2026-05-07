/**
 * Integration test: delete_project() cascade.
 *
 * Verifies that calling the RPC removes the project row plus its
 * dependent project_images and project_image_filters in one
 * transaction. The cascade is guarded by `guard_master_immutable` —
 * delete_project() sets the `app.deleting_project` GUC so the trigger
 * lets master rows through. If that wiring breaks, this test fails.
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

describe("delete_project()", () => {
  let supabase: SupabaseClient<Database>

  beforeAll(() => {
    supabase = getServiceClient()
  })

  // Track ids per test so afterEach can sweep even on assertion failure.
  let projectId: string | null = null
  let ownerId: string | null = null

  afterEach(async () => {
    if (projectId && ownerId) {
      await cleanupProject({ supabase, projectId, ownerId })
    }
    projectId = null
    ownerId = null
  })

  it("removes project, images, and filters in one cascade", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId

    const master = await seedImage({ supabase, projectId, kind: "master" })
    const filterOutput = await seedImage({
      supabase,
      projectId,
      kind: "filter_working_copy",
      sourceImageId: master.imageId,
    })
    const { error: filterErr } = await supabase
      .from("project_image_filters")
      .insert({
        project_id: projectId,
        input_image_id: master.imageId,
        output_image_id: filterOutput.imageId,
        filter_type: "pixelate",
        stack_order: 1,
      })
    expect(filterErr).toBeNull()

    const { data: deletedId, error: rpcErr } = await supabase.rpc(
      "delete_project",
      { p_project_id: projectId },
    )
    expect(rpcErr).toBeNull()
    expect(deletedId).toBe(projectId)

    const { count: projectCount } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("id", projectId)
    expect(projectCount).toBe(0)

    const { count: filterCount } = await supabase
      .from("project_image_filters")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
    expect(filterCount).toBe(0)

    const { count: imageCount } = await supabase
      .from("project_images")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
    expect(imageCount).toBe(0)

    // Already deleted — afterEach noop.
    projectId = null
  })

  it("raises P0002 when the project does not exist", async () => {
    const ghost = "00000000-0000-0000-0000-000000000000"
    const { error } = await supabase.rpc("delete_project", {
      p_project_id: ghost,
    })
    expect(error).not.toBeNull()
    // Postgres maps P0002 ("no_data_found") through PostgREST as a 404-ish
    // error — message contains the raised text.
    expect(String(error?.message ?? "")).toMatch(/project not found/i)
  })
})
