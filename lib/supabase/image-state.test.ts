import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { loadBoundImageState, upsertBoundImageState } from "@/lib/supabase/image-state"

type QueryResult = { data: unknown; error: { message: string } | null }

function makeSupabase(result: QueryResult, calls: Array<{ method: "eq"; key: string; value: unknown }>) {
  return {
    from: (table: string) => {
      expect(table).toBe("project_image_state")
      return {
        select: () => ({
          eq: (key1: string, value1: unknown) => {
            calls.push({ method: "eq", key: key1, value: value1 })
            return {
              eq: (key2: string, value2: unknown) => {
                calls.push({ method: "eq", key: key2, value: value2 })
                return {
                  eq: (key3: string, value3: unknown) => {
                    calls.push({ method: "eq", key: key3, value: value3 })
                    return {
                      maybeSingle: async () => result,
                    }
                  },
                }
              },
            }
          },
        }),
      }
    },
  } as unknown as SupabaseClient
}

function makeSupabaseUpsert(result: { error: { message: string } | null }, calls: Array<{ row: Record<string, unknown>; onConflict: string }>) {
  return {
    from: (table: string) => {
      expect(table).toBe("project_image_state")
      return {
        upsert: async (row: Record<string, unknown>, opts: { onConflict: string }) => {
          calls.push({ row, onConflict: opts.onConflict })
          return result
        },
      }
    },
  } as unknown as SupabaseClient
}

describe("loadBoundImageState", () => {
  it("short-circuits when there is no active image id", async () => {
    const calls: Array<{ method: "eq"; key: string; value: unknown }> = []
    const supabase = makeSupabase({ data: null, error: null }, calls)
    const out = await loadBoundImageState(supabase, "p", null)
    expect(out).toEqual({ row: null, error: null, unsupported: false })
    expect(calls).toEqual([])
  })

  it("returns query error when select fails", async () => {
    const calls: Array<{ method: "eq"; key: string; value: unknown }> = []
    const supabase = makeSupabase({ data: null, error: { message: "boom" } }, calls)
    const out = await loadBoundImageState(supabase, "p1", "img1")
    expect(out).toEqual({ row: null, error: "boom", unsupported: false })
  })

  it("returns unsupported when canonical µpx values are missing", async () => {
    const calls: Array<{ method: "eq"; key: string; value: unknown }> = []
    const supabase = makeSupabase(
      {
        data: { image_id: "img1", x_px_u: null, y_px_u: null, width_px_u: null, height_px_u: "1000", rotation_deg: 0 },
        error: null,
      },
      calls
    )
    const out = await loadBoundImageState(supabase, "p2", "img1")
    expect(out).toEqual({ row: null, error: null, unsupported: true })
  })

  it("maps a bound state row", async () => {
    const calls: Array<{ method: "eq"; key: string; value: unknown }> = []
    const supabase = makeSupabase(
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
      calls
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
      { method: "eq", key: "role", value: "master" },
      { method: "eq", key: "image_id", value: "img9" },
    ])
  })
})

describe("upsertBoundImageState", () => {
  it("upserts with expected conflict key", async () => {
    const calls: Array<{ row: Record<string, unknown>; onConflict: string }> = []
    const supabase = makeSupabaseUpsert({ error: null }, calls)

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
        onConflict: "project_id,role",
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

  it("maps upsert errors", async () => {
    const calls: Array<{ row: Record<string, unknown>; onConflict: string }> = []
    const supabase = makeSupabaseUpsert({ error: { message: "upsert failed" } }, calls)
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

