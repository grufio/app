/**
 * Integration test: legacy non-master state rows are purged by the
 * `20260512320000_purge_non_master_state.sql` migration.
 *
 * Pre-cleanup behaviour (before PR-2 split image activation) wrote
 * `project_image_state` rows at filter_working_copy / trace_output
 * ids. These rows are unreachable by the editor (which resolves at
 * master.id) but never deleted. This test re-runs the purge DELETE
 * statement against a seeded mix and asserts only the master rows
 * survive.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { Client as PgClient } from "pg"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

import {
  cleanupProject,
  getServiceClient,
  seedImage,
  seedProject,
} from "./_setup"

const PURGE_SQL = readFileSync(
  new URL("../../supabase/migrations/20260512320000_purge_non_master_state.sql", import.meta.url),
  "utf-8",
)

const DB_URL =
  process.env.SUPABASE_INTEGRATION_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

async function runPurge(): Promise<void> {
  const pg = new PgClient({ connectionString: DB_URL })
  try {
    await pg.connect()
    await pg.query(PURGE_SQL)
  } finally {
    await pg.end().catch(() => {})
  }
}

describe("purge non-master state rows migration", () => {
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

  it("removes state rows pointing at filter_working_copy / trace_output ids", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId

    const master = await seedImage({ supabase, projectId, kind: "master" })
    const workingCopy = await seedImage({
      supabase,
      projectId,
      kind: "working_copy",
      sourceImageId: master.imageId,
    })
    const filterCopy = await seedImage({
      supabase,
      projectId,
      kind: "filter_working_copy",
      sourceImageId: workingCopy.imageId,
    })
    const traceOut = await seedImage({
      supabase,
      projectId,
      kind: "trace_output",
      sourceImageId: filterCopy.imageId,
    })

    // Seed one legit state row at master.id and three junk rows.
    await supabase.from("project_image_state").insert([
      { project_id: projectId, image_id: master.imageId, width_px_u: "100000000", height_px_u: "100000000", rotation_deg: 0 },
      { project_id: projectId, image_id: workingCopy.imageId, width_px_u: "200000000", height_px_u: "200000000", rotation_deg: 0 },
      { project_id: projectId, image_id: filterCopy.imageId, width_px_u: "300000000", height_px_u: "300000000", rotation_deg: 0 },
      { project_id: projectId, image_id: traceOut.imageId, width_px_u: "400000000", height_px_u: "400000000", rotation_deg: 0 },
    ])

    await runPurge()

    const { data } = await supabase
      .from("project_image_state")
      .select("image_id")
      .eq("project_id", projectId)
    expect(data?.map((r) => r.image_id).sort()).toEqual([master.imageId])
  })

  it("preserves rows at the live master.id and never deletes them", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId
    const master = await seedImage({ supabase, projectId, kind: "master" })

    await supabase.from("project_image_state").insert({
      project_id: projectId,
      image_id: master.imageId,
      x_px_u: "10",
      y_px_u: "20",
      width_px_u: "100000000",
      height_px_u: "200000000",
      rotation_deg: 0,
    })

    await runPurge()

    const { data, error } = await supabase
      .from("project_image_state")
      .select("x_px_u, y_px_u, width_px_u, height_px_u, rotation_deg")
      .eq("project_id", projectId)
      .eq("image_id", master.imageId)
      .single()
    expect(error).toBeNull()
    expect(data?.x_px_u).toBe("10")
    expect(data?.y_px_u).toBe("20")
    expect(data?.width_px_u).toBe("100000000")
    expect(data?.height_px_u).toBe("200000000")
  })

  it("removes rows whose master has been soft-deleted (orphan after rename)", async () => {
    // Edge: even if a master row was soft-deleted (won't happen via the
    // app — guard_master_immutable blocks it — but possible via direct
    // SQL during an emergency repair), state rows at that id are junk.
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId

    // Use a working_copy as the "tombstoned master" stand-in: identical
    // selection effect (non-master OR deleted_at IS NOT NULL).
    const master = await seedImage({ supabase, projectId, kind: "master" })
    const workingCopy = await seedImage({
      supabase,
      projectId,
      kind: "working_copy",
      sourceImageId: master.imageId,
    })

    await supabase.from("project_image_state").insert({
      project_id: projectId,
      image_id: workingCopy.imageId,
      width_px_u: "1000000",
      height_px_u: "1000000",
      rotation_deg: 0,
    })

    await runPurge()

    const { data } = await supabase
      .from("project_image_state")
      .select("image_id")
      .eq("project_id", projectId)
    expect(data).toEqual([])
  })

  it("is idempotent — a second apply changes nothing", async () => {
    const seeded = await seedProject({ supabase })
    projectId = seeded.projectId
    ownerId = seeded.ownerId
    const master = await seedImage({ supabase, projectId, kind: "master" })

    await supabase.from("project_image_state").insert({
      project_id: projectId,
      image_id: master.imageId,
      width_px_u: "100000000",
      height_px_u: "100000000",
      rotation_deg: 0,
    })

    await runPurge()
    await runPurge()

    const { data } = await supabase
      .from("project_image_state")
      .select("image_id")
      .eq("project_id", projectId)
    expect(data?.length).toBe(1)
  })
})
