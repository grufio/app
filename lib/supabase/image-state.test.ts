import { describe, expect, it } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { loadBoundImageState, upsertBoundImageState } from "@/lib/supabase/image-state"

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
      role: "master",
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
          role: "master",
          x_px_u: "1",
          y_px_u: "2",
          width_px_u: "3",
          height_px_u: "4",
          rotation_deg: 5,
        },
      },
    ])
  })

  it("defaults role to master when omitted", async () => {
    const calls: UpsertCall[] = []
    const supabase = makeUpsertSupabase({ error: null }, calls)
    const out = await upsertBoundImageState(supabase, {
      project_id: "p2",
      image_id: "img2",
      x_px_u: null,
      y_px_u: null,
      width_px_u: "10",
      height_px_u: "20",
      rotation_deg: 0,
    })
    expect(out).toEqual({ ok: true })
    expect(calls[0]?.row.role).toBe("master")
  })

  it("maps upsert errors", async () => {
    const calls: UpsertCall[] = []
    const supabase = makeUpsertSupabase({ error: { message: "upsert failed" } }, calls)
    const out = await upsertBoundImageState(supabase, {
      project_id: "p1",
      image_id: "img1",
      role: "master",
      x_px_u: null,
      y_px_u: null,
      width_px_u: "3",
      height_px_u: "4",
      rotation_deg: 0,
    })
    expect(out).toEqual({ ok: false, error: "upsert failed" })
  })
})
