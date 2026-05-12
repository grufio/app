/**
 * Integration tests for project_image_state DB constraints added in
 * `20260512300000_state_axis_pair_and_softdelete.sql`:
 *
 * - Axis-pairing CHECK: rows with one axis null and the other set
 *   are rejected with errcode 23514.
 * - Soft-delete cascade trigger: setting `deleted_at` on a
 *   project_images row removes its corresponding state row.
 *
 * Talks to the local Supabase via the service-role client; each test
 * seeds + cleans up its own fixtures.
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

describe("project_image_state constraints", () => {
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

  it("accepts a row with both axes null (preserve-both semantic)", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId
    const master = await seedImage({ supabase, projectId, kind: "master" })

    const { error } = await supabase.from("project_image_state").insert({
      project_id: projectId,
      image_id: master.imageId,
      x_px_u: null,
      y_px_u: null,
      width_px_u: "1000000",
      height_px_u: "1000000",
      rotation_deg: 0,
    })
    expect(error).toBeNull()
  })

  it("accepts a row with both axes set", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId
    const master = await seedImage({ supabase, projectId, kind: "master" })

    const { error } = await supabase.from("project_image_state").insert({
      project_id: projectId,
      image_id: master.imageId,
      x_px_u: "0",
      y_px_u: "0",
      width_px_u: "1000000",
      height_px_u: "1000000",
      rotation_deg: 0,
    })
    expect(error).toBeNull()
  })

  it("rejects a row with x_px_u set and y_px_u null (23514)", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId
    const master = await seedImage({ supabase, projectId, kind: "master" })

    const { error } = await supabase.from("project_image_state").insert({
      project_id: projectId,
      image_id: master.imageId,
      x_px_u: "100",
      y_px_u: null,
      width_px_u: "1000000",
      height_px_u: "1000000",
      rotation_deg: 0,
    })
    expect(error).not.toBeNull()
    expect((error as { code?: string } | null)?.code).toBe("23514")
  })

  it("rejects a row with y_px_u set and x_px_u null (23514)", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId
    const master = await seedImage({ supabase, projectId, kind: "master" })

    const { error } = await supabase.from("project_image_state").insert({
      project_id: projectId,
      image_id: master.imageId,
      x_px_u: null,
      y_px_u: "100",
      width_px_u: "1000000",
      height_px_u: "1000000",
      rotation_deg: 0,
    })
    expect(error).not.toBeNull()
    expect((error as { code?: string } | null)?.code).toBe("23514")
  })

  it("rejects an UPDATE that breaks the axis-pairing invariant", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId
    const master = await seedImage({ supabase, projectId, kind: "master" })

    const { error: insertErr } = await supabase.from("project_image_state").insert({
      project_id: projectId,
      image_id: master.imageId,
      x_px_u: "0",
      y_px_u: "0",
      width_px_u: "1000000",
      height_px_u: "1000000",
      rotation_deg: 0,
    })
    expect(insertErr).toBeNull()

    const { error: updErr } = await supabase
      .from("project_image_state")
      .update({ y_px_u: null })
      .eq("project_id", projectId)
      .eq("image_id", master.imageId)
    expect(updErr).not.toBeNull()
    expect((updErr as { code?: string } | null)?.code).toBe("23514")
  })

  it("cascades state cleanup on soft-delete of the image", async () => {
    // The trigger applies to any project_images row, not just master.
    // Use a filter_working_copy here because master rows are guarded
    // against direct mutation by `guard_master_immutable`. State rows
    // in production always anchor at master.id, but pre-cleanup junk
    // rows existed at non-master ids — this test pins the cleanup
    // semantics for those exact junk rows.
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId
    const master = await seedImage({ supabase, projectId, kind: "master" })
    const filterCopy = await seedImage({
      supabase,
      projectId,
      kind: "filter_working_copy",
      sourceImageId: master.imageId,
    })

    const { error: insertErr } = await supabase.from("project_image_state").insert({
      project_id: projectId,
      image_id: filterCopy.imageId,
      x_px_u: "0",
      y_px_u: "0",
      width_px_u: "1000000",
      height_px_u: "1000000",
      rotation_deg: 0,
    })
    expect(insertErr).toBeNull()

    // Soft-delete the filter copy — fires the new trigger.
    const { error: deleteErr } = await supabase
      .from("project_images")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", filterCopy.imageId)
    expect(deleteErr).toBeNull()

    const { data, error: selectErr } = await supabase
      .from("project_image_state")
      .select("image_id")
      .eq("project_id", projectId)
      .eq("image_id", filterCopy.imageId)
    expect(selectErr).toBeNull()
    expect(data).toEqual([])
  })

  it("does NOT fire the trigger on non-deleted_at UPDATEs", async () => {
    // The WHEN clause requires `OLD.deleted_at IS NULL AND
    // NEW.deleted_at IS NOT NULL`. Renaming should not affect state.
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId
    const master = await seedImage({ supabase, projectId, kind: "master" })
    const filterCopy = await seedImage({
      supabase,
      projectId,
      kind: "filter_working_copy",
      sourceImageId: master.imageId,
    })

    await supabase.from("project_image_state").insert({
      project_id: projectId,
      image_id: filterCopy.imageId,
      x_px_u: "0",
      y_px_u: "0",
      width_px_u: "1000000",
      height_px_u: "1000000",
      rotation_deg: 0,
    })

    const { error: updErr } = await supabase
      .from("project_images")
      .update({ name: "renamed" })
      .eq("id", filterCopy.imageId)
    expect(updErr).toBeNull()

    const { data } = await supabase
      .from("project_image_state")
      .select("image_id")
      .eq("project_id", projectId)
      .eq("image_id", filterCopy.imageId)
    expect(data?.length).toBe(1)
  })
})
