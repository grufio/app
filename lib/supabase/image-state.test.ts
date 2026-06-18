import { describe, expect, it } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { loadBoundImageState, resolveStateAnchorImage, upsertBoundImageState } from "@/lib/supabase/image-state"

type SelectResult = { data: unknown; error: { message: string } | null }
type EqCall = { method: "eq"; key: string; value: unknown }
type UpsertCall = { row: Record<string, unknown>; onConflict: string }

function makeSelectSupabase(result: SelectResult, eqCalls: EqCall[]) {
  return makeMockSupabase({
    tables: {
      project_image_state: {
        select: {
          data: result.data,
          error: result.error,
          // Capture each chain method invocation. The production code
          // chains `.eq("project_id", …).eq("image_id", …).maybeSingle()`,
          // so chainArgs holds two entries.
          onCall: ({ args: chainArgs }) => {
            for (const callArgs of chainArgs as unknown[][]) {
              if (callArgs.length === 2 && typeof callArgs[0] === "string") {
                eqCalls.push({ method: "eq", key: callArgs[0], value: callArgs[1] })
              }
            }
          },
        },
      },
    },
  })
}

function makeUpsertSupabase(result: { error: { message: string } | null }, calls: UpsertCall[]) {
  return makeMockSupabase({
    tables: {
      project_image_state: {
        upsert: {
          data: null,
          error: result.error,
          onCall: ({ opArgs }) => {
            const [row, opts] = opArgs as [Record<string, unknown>, { onConflict: string }]
            calls.push({ row, onConflict: opts.onConflict })
          },
        },
      },
    },
  })
}

describe("loadBoundImageState", () => {
  it("short-circuits when there is no active image id", async () => {
    const calls: EqCall[] = []
    const supabase = makeSelectSupabase({ data: null, error: null }, calls)
    const out = await loadBoundImageState(supabase, "p", null)
    expect(out).toEqual({ row: null, error: null, unsupported: false })
    expect(calls).toEqual([])
  })

  it("returns query error when select fails", async () => {
    const calls: EqCall[] = []
    const supabase = makeSelectSupabase({ data: null, error: { message: "boom" } }, calls)
    const out = await loadBoundImageState(supabase, "p1", "img1")
    expect(out).toEqual({ row: null, error: "boom", unsupported: false })
  })

  it("returns unsupported when canonical µpx values are missing", async () => {
    const calls: EqCall[] = []
    const supabase = makeSelectSupabase(
      {
        data: { image_id: "img1", x_px_u: null, y_px_u: null, width_px_u: null, height_px_u: "1000", rotation_deg: 0 },
        error: null,
      },
      calls,
    )
    const out = await loadBoundImageState(supabase, "p2", "img1")
    expect(out).toEqual({ row: null, error: null, unsupported: true })
  })

  it("maps a bound state row", async () => {
    const calls: EqCall[] = []
    const supabase = makeSelectSupabase(
      {
        data: {
          image_id: "img9",
          x_px_u: "10",
          y_px_u: "20",
          width_px_u: "1000000",
          height_px_u: "2000000",
          rotation_deg: 45,
        },
        error: null,
      },
      calls,
    )
    const out = await loadBoundImageState(supabase, "p9", "img9")
    expect(out).toEqual({
      row: {
        image_id: "img9",
        x_px_u: "10",
        y_px_u: "20",
        width_px_u: "1000000",
        height_px_u: "2000000",
        rotation_deg: 45,
      },
      error: null,
      unsupported: false,
    })
    expect(calls).toEqual([
      { method: "eq", key: "project_id", value: "p9" },
      { method: "eq", key: "image_id", value: "img9" },
    ])
  })
})

describe("upsertBoundImageState", () => {
  it("upserts with expected conflict key", async () => {
    const calls: UpsertCall[] = []
    const supabase = makeUpsertSupabase({ error: null }, calls)

    const out = await upsertBoundImageState(supabase, {
      project_id: "p1",
      image_id: "img1",
      x_px_u: "1",
      y_px_u: "2",
      width_px_u: "3",
      height_px_u: "4",
      rotation_deg: 5,
    })

    expect(out).toEqual({ ok: true })
    expect(calls).toEqual([
      {
        onConflict: "project_id,image_id",
        row: {
          project_id: "p1",
          image_id: "img1",
          x_px_u: "1",
          y_px_u: "2",
          width_px_u: "3",
          height_px_u: "4",
          rotation_deg: 5,
        },
      },
    ])
  })

  it("maps upsert errors", async () => {
    const calls: UpsertCall[] = []
    const supabase = makeUpsertSupabase({ error: { message: "upsert failed" } }, calls)
    const out = await upsertBoundImageState(supabase, {
      project_id: "p1",
      image_id: "img1",
      x_px_u: null,
      y_px_u: null,
      width_px_u: "3",
      height_px_u: "4",
      rotation_deg: 0,
    })
    expect(out).toEqual({ ok: false, error: "upsert failed" })
  })
})

// --- resolveStateAnchorImage (P0-4) --------------------------------------
//
// The state anchor is the project's working_copy row — NOT the master.
// `resolveStateAnchorImage` selects from `project_images` with
// `kind='working_copy'`, `deleted_at IS NULL`, ordered `created_at DESC`,
// `limit(1)`. These tests pin that contract: a wrong filter
// (`kind='master'`), a missing `deleted_at IS NULL` clause, or a flipped
// order direction would break one of the assertions below.
//
// The mock does not order/filter rows itself — it returns whatever the
// production query *would* return for the given chain. So the "newest
// working_copy" case is enforced structurally via `onCall`: we assert the
// query actually orders `created_at` descending and limits to 1 (the only
// way the DB returns the newest row), then return that single newest row.

type ChainCall = { ops: string[]; args: unknown[][] }

function makeAnchorSupabase(
  result: { data: unknown; error: { message: string } | null },
  captured: ChainCall[],
) {
  return makeMockSupabase({
    tables: {
      project_images: {
        select: {
          data: result.data,
          error: result.error,
          onCall: ({ ops, args }) => {
            captured.push({ ops, args: args as unknown[][] })
          },
        },
      },
    },
  })
}

/** Find the [col, val] arg-pair for a given chain method occurrence. */
function findArgPair(captured: ChainCall[], col: string): unknown[] | undefined {
  const calls = captured[0]?.args ?? []
  return calls.find((a) => Array.isArray(a) && a[0] === col)
}

describe("resolveStateAnchorImage", () => {
  it("returns the working_copy id for a single working_copy", async () => {
    const captured: ChainCall[] = []
    const supabase = makeAnchorSupabase(
      { data: { id: "wc-1" }, error: null },
      captured,
    )

    const out = await resolveStateAnchorImage(supabase, "proj-1")

    expect(out).toEqual({ id: "wc-1" })

    // The resolver MUST filter on kind='working_copy' (not 'master') and
    // exclude tombstoned rows. Rot if the code ever selects master.
    expect(findArgPair(captured, "kind")).toEqual(["kind", "working_copy"])
    expect(findArgPair(captured, "kind")).not.toEqual(["kind", "master"])
    expect(findArgPair(captured, "project_id")).toEqual(["project_id", "proj-1"])
    expect(findArgPair(captured, "deleted_at")).toEqual(["deleted_at", null])
    // Terminal must be maybeSingle (single-row contract).
    expect(captured[0]?.ops).toContain("maybeSingle")
  })

  it("returns the NEWEST non-deleted working_copy (order created_at desc, limit 1)", async () => {
    const captured: ChainCall[] = []
    // The DB would return only the newest row for `order desc + limit 1`.
    // We model that single returned row and assert the ordering contract
    // structurally below.
    const supabase = makeAnchorSupabase(
      { data: { id: "wc-newest" }, error: null },
      captured,
    )

    const out = await resolveStateAnchorImage(supabase, "proj-1")

    expect(out).toEqual({ id: "wc-newest" })

    // "Newest" is enforced by the query: created_at DESC + limit(1).
    expect(findArgPair(captured, "created_at")).toEqual(["created_at", { ascending: false }])
    const limitCall = (captured[0]?.args ?? []).find(
      (a) => Array.isArray(a) && a.length === 1 && a[0] === 1,
    )
    expect(limitCall).toEqual([1])
  })

  it("returns notFound when no working_copy exists (master-only project)", async () => {
    const captured: ChainCall[] = []
    const supabase = makeAnchorSupabase({ data: null, error: null }, captured)

    const out = await resolveStateAnchorImage(supabase, "proj-1")

    expect(out).toEqual({ notFound: true })
    // Even on the empty path the filter must be working_copy, never master.
    expect(findArgPair(captured, "kind")).toEqual(["kind", "working_copy"])
  })

  it("returns the query error message when the select fails", async () => {
    const captured: ChainCall[] = []
    const supabase = makeAnchorSupabase(
      { data: null, error: { message: "anchor query boom" } },
      captured,
    )

    const out = await resolveStateAnchorImage(supabase, "proj-1")

    expect(out).toEqual({ error: "anchor query boom" })
  })
})
