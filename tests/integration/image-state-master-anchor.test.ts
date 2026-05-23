/**
 * Integration test: master identity vs. state anchor (two distinct things).
 *
 * 1. Master identity (`getProjectMasterImageId`): the immutable
 *    kind='master' row id. This is the stable identity used as the
 *    client-side reset key (`masterRowId`). Tests 1+2 below pin it.
 *
 * 2. State anchor (`resolveStateAnchorImage`): the row id under which
 *    `project_image_state` is keyed. Post the working-copy refactor
 *    (PR #257/#258) this is the project's NEWEST non-deleted
 *    `kind='working_copy'` row — NOT the master. Master upload creates
 *    the working_copy eagerly; the state row follows it. Test 3 below
 *    pins this against the real resolver.
 *
 * These two used to be conflated ("anchored at master.id"); they are
 * decoupled by design, and the prod DB confirms it (8/8 state rows are
 * keyed at kind='working_copy', 0 at master). Test 3 was previously
 * written against master.id and never called the resolver — it asserted
 * the wrong contract while staying green. It now exercises
 * `resolveStateAnchorImage` directly.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { getProjectMasterImageId } from "@/lib/supabase/project-images"
import { resolveStateAnchorImage } from "@/lib/supabase/image-state"

import {
  cleanupProject,
  getServiceClient,
  seedImage,
  seedProject,
} from "./_setup"

describe("master identity vs state anchor", () => {
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

  // --- Master identity (separate concern from the state anchor) ----------

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

  // --- State anchor = newest non-deleted working_copy (NOT master) -------

  it("resolveStateAnchorImage returns the newest non-deleted working_copy, never the master", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId

    const master = await seedImage({ supabase, projectId, kind: "master" })

    // Two working copies: an older one and a newer one. Distinct,
    // explicit created_at values make the "newest" ordering deterministic
    // (the DB default `now()` could collide within the same microsecond).
    const olderWc = await seedImage({
      supabase,
      projectId,
      kind: "working_copy",
      sourceImageId: master.imageId,
      name: "wc (older)",
    })
    const newerWc = await seedImage({
      supabase,
      projectId,
      kind: "working_copy",
      sourceImageId: master.imageId,
      name: "wc (newer)",
    })

    // Pin ordering + lock state explicitly. The newer working_copy is the
    // expected anchor; lock it to assert the is_locked boolean coercion.
    {
      const { error: olderErr } = await supabase
        .from("project_images")
        .update({ created_at: "2026-01-01T00:00:00Z", is_locked: false })
        .eq("id", olderWc.imageId)
      expect(olderErr).toBeNull()
      const { error: newerErr } = await supabase
        .from("project_images")
        .update({ created_at: "2026-02-01T00:00:00Z", is_locked: true })
        .eq("id", newerWc.imageId)
      expect(newerErr).toBeNull()
    }

    const anchor = await resolveStateAnchorImage(supabase, projectId)

    // The anchor MUST be the newest working_copy — never the master id.
    expect(anchor).toEqual({ id: newerWc.imageId, is_locked: true })
    if ("id" in anchor) {
      expect(anchor.id).not.toBe(master.imageId)
      expect(anchor.id).not.toBe(olderWc.imageId)
    }
  })

  it("resolveStateAnchorImage reports notFound after every working_copy is tombstoned (no fallback to master)", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId

    const master = await seedImage({ supabase, projectId, kind: "master" })
    const wc = await seedImage({
      supabase,
      projectId,
      kind: "working_copy",
      sourceImageId: master.imageId,
      name: "wc",
    })

    // Sanity: with a live working_copy it resolves to that working_copy.
    const before = await resolveStateAnchorImage(supabase, projectId)
    expect(before).toEqual({ id: wc.imageId, is_locked: false })

    // Tombstone the only working_copy.
    const { error: tombstoneErr } = await supabase
      .from("project_images")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", wc.imageId)
    expect(tombstoneErr).toBeNull()

    // The master still exists — but the resolver MUST NOT fall back to it.
    const after = await resolveStateAnchorImage(supabase, projectId)
    expect(after).toEqual({ notFound: true })
  })
})
