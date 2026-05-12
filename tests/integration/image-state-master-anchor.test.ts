/**
 * Integration test: project_image_state is anchored at master.id.
 *
 * Pre-refactor the row's image_id followed whichever filter_working_copy
 * the editor last wrote against, so chain-reset / filter-base-copy
 * recreation orphaned the user's transform. After this refactor any
 * write through the API resolves to master.id; the canvas surface the
 * client was rendering is informational (lock guard only).
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { getProjectMasterImageId } from "@/lib/supabase/project-images"
import { loadBoundImageState, upsertBoundImageState } from "@/lib/supabase/image-state"

import {
  cleanupProject,
  getServiceClient,
  seedImage,
  seedProject,
} from "./_setup"

describe("image-state master anchor", () => {
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

  it("getProjectMasterImageId returns the master row's id", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId

    const master = await seedImage({ supabase, projectId, kind: "master" })
    await seedImage({
      supabase,
      projectId,
      kind: "working_copy",
      sourceImageId: master.imageId,
    })

    const { masterId, error } = await getProjectMasterImageId(supabase, projectId)
    expect(error).toBeNull()
    expect(masterId).toBe(master.imageId)
  })

  it("getProjectMasterImageId returns null when no master exists", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId

    const { masterId, error } = await getProjectMasterImageId(supabase, projectId)
    expect(error).toBeNull()
    expect(masterId).toBeNull()
  })

  it("state written at master.id survives filter_working_copy tombstone", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId

    const master = await seedImage({ supabase, projectId, kind: "master" })
    const fwc = await seedImage({
      supabase,
      projectId,
      kind: "filter_working_copy",
      sourceImageId: master.imageId,
      name: "img (filter working)",
    })

    // Save state at master.id (the new anchor).
    const upsertResult = await upsertBoundImageState(supabase, {
      project_id: projectId,
      image_id: master.imageId,
      x_px_u: "100000000",
      y_px_u: "200000000",
      width_px_u: "300000000",
      height_px_u: "400000000",
      rotation_deg: 0,
    })
    expect(upsertResult.ok).toBe(true)

    // Tombstone the filter_working_copy — simulates a chain-reset
    // re-creating the base copy under a fresh UUID.
    await supabase
      .from("project_images")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", fwc.imageId)

    // State at master.id is still readable.
    const { row, error } = await loadBoundImageState(supabase, projectId, master.imageId)
    expect(error).toBeNull()
    expect(row?.width_px_u).toBe("300000000")
    expect(row?.height_px_u).toBe("400000000")
  })
})
