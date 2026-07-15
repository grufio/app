/**
 * Live RLS enforcement — cross-owner isolation.
 *
 * `verify:rls` proves every protected table *declares* an owner-only policy in
 * db/schema.sql (static). This proves those policies actually *enforce* at
 * runtime: a second authenticated user can neither read nor write another
 * owner's rows in any of the RLS_PROTECTED_TABLES, and the owner still sees
 * their own (the policy isn't over-blocking).
 *
 * Requests run through user-scoped clients (getUserClient → a real user JWT),
 * so `auth.uid()` resolves per-user exactly as in production — not the
 * service-role client that bypasses RLS.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { RLS_PROTECTED_TABLES } from "../../scripts/_rls-tables.mjs"
import {
  cleanupProject,
  getServiceClient,
  getUserClient,
  seedImage,
  seedProject,
  seedTrace,
} from "./_setup"

// px_u is µpx (1 px = 72000 µpx); 100 px -> 7_200_000 keeps the
// project_workspace px-cache-consistency CHECK happy.
const PX = 100
const PX_U = 7_200_000

const service = getServiceClient()

/** Loosely-typed table accessor: the typed client rejects a `string` relation
 * name, and this suite iterates over a table *list*. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tbl(client: SupabaseClient<never>, table: string): any {
  return (client as unknown as { from: (t: string) => unknown }).from(table)
}

/** Seed one row in every protected table under `projectId`. */
async function seedAllOwnerTables(projectId: string) {
  const { imageId: masterId } = await seedImage({ supabase: service, projectId, kind: "master" })
  const { imageId: fwcId } = await seedImage({
    supabase: service,
    projectId,
    kind: "filter_working_copy",
    sourceImageId: masterId,
  })
  const { imageId: traceOutId } = await seedImage({
    supabase: service,
    projectId,
    kind: "trace_output",
    sourceImageId: fwcId,
  })
  // linerate needs no trace_base row (pixelate's base_image_required_ck does).
  await seedTrace({ supabase: service, projectId, outputImageId: traceOutId, kind: "linerate" })

  const rows: Array<{ table: string; row: Record<string, unknown> }> = [
    { table: "project_grid", row: { project_id: projectId, color: "#000000", line_width_value: 1, spacing_x_value: 10, spacing_y_value: 10 } },
    { table: "project_workspace", row: { project_id: projectId, width_value: PX, height_value: PX, width_px: PX, height_px: PX, width_px_u: PX_U, height_px_u: PX_U } },
    { table: "project_image_state", row: { project_id: projectId, width_px_u: PX_U, height_px_u: PX_U, image_id: fwcId } },
    { table: "project_image_filters", row: { project_id: projectId, input_image_id: masterId, output_image_id: fwcId, filter_type: "bw_hard" } },
  ]
  for (const { table, row } of rows) {
    const { error } = await tbl(service, table).insert(row)
    if (error) throw new Error(`seedAllOwnerTables: ${table} insert failed: ${JSON.stringify(error)}`)
  }
}

// projects is owner-scoped by `id`; every other protected table by `project_id`.
// The filter VALUE is always the project id either way.
function ownerFilterColumn(table: string): "id" | "project_id" {
  return table === "projects" ? "id" : "project_id"
}

describe("RLS cross-owner isolation (live)", () => {
  let ownerA: { projectId: string; ownerId: string }
  let ownerB: { projectId: string; ownerId: string }

  beforeAll(async () => {
    ownerA = await seedProject({ supabase: service })
    ownerB = await seedProject({ supabase: service })
    await seedAllOwnerTables(ownerA.projectId)
  })

  afterAll(async () => {
    await cleanupProject({ supabase: service, projectId: ownerA.projectId, ownerId: ownerA.ownerId })
    await cleanupProject({ supabase: service, projectId: ownerB.projectId, ownerId: ownerB.ownerId })
  })

  it("covers every RLS_PROTECTED_TABLES entry", () => {
    // Guards against the shared list drifting out from under the loop below.
    expect(RLS_PROTECTED_TABLES.length).toBeGreaterThanOrEqual(7)
  })

  describe("a foreign owner cannot READ another owner's rows", () => {
    for (const table of RLS_PROTECTED_TABLES) {
      it(`${table}: owner B sees 0 of owner A's rows, owner A sees their own`, async () => {
        const col = ownerFilterColumn(table)
        const val = ownerA.projectId

        const asB = await tbl(getUserClient(ownerB.ownerId), table).select(col).eq(col, val)
        expect(asB.error).toBeNull()
        expect(asB.data ?? []).toHaveLength(0)

        const asA = await tbl(getUserClient(ownerA.ownerId), table).select(col).eq(col, val)
        expect(asA.error).toBeNull()
        expect((asA.data ?? []).length).toBeGreaterThanOrEqual(1)
      })
    }
  })

  it("a foreign owner cannot UPDATE another owner's project (direct-owner policy)", async () => {
    const bClient = getUserClient(ownerB.ownerId)
    const upd = await bClient.from("projects").update({ name: "hijacked" }).eq("id", ownerA.projectId).select("id")
    expect(upd.error).toBeNull()
    expect(upd.data ?? []).toHaveLength(0) // RLS filters the row → 0 affected

    const { data } = await service.from("projects").select("name").eq("id", ownerA.projectId).single()
    expect(data?.name).not.toBe("hijacked")
  })

  it("a foreign owner cannot DELETE another owner's images (project-join policy)", async () => {
    const bClient = getUserClient(ownerB.ownerId)
    const del = await bClient.from("project_images").delete().eq("project_id", ownerA.projectId).select("id")
    expect(del.error).toBeNull()
    expect(del.data ?? []).toHaveLength(0)

    const { data } = await service.from("project_images").select("id").eq("project_id", ownerA.projectId)
    expect((data ?? []).length).toBeGreaterThanOrEqual(1) // rows survived
  })

  it("a foreign owner cannot INSERT into another owner's project (WITH CHECK)", async () => {
    const bClient = getUserClient(ownerB.ownerId)
    const ins = await bClient.from("project_grid").insert({
      project_id: ownerA.projectId,
      color: "#ffffff",
      line_width_value: 2,
      spacing_x_value: 5,
      spacing_y_value: 5,
    })
    expect(ins.error).not.toBeNull() // WITH CHECK rejects the write
  })
})
