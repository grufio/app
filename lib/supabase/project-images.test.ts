import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { activateMasterWithState, getActiveMasterImage, getActiveMasterImageId, PROJECT_IMAGES_BUCKET } from "@/lib/supabase/project-images"

type QueryResult = { data: unknown; error: { message: string } | null }

function makeSupabase(result: QueryResult, calls: Array<{ method: "eq" | "is"; key: string; value: unknown }>) {
  return {
    from: (table: string) => {
      expect(table).toBe("project_images")
      return {
        select: (_fields: string) => ({
          eq: (key1: string, value1: unknown) => {
            calls.push({ method: "eq", key: key1, value: value1 })
            return {
              eq: (key2: string, value2: unknown) => {
                calls.push({ method: "eq", key: key2, value: value2 })
                return {
                  eq: (key3: string, value3: unknown) => {
                    calls.push({ method: "eq", key: key3, value: value3 })
                    return {
                      is: (key4: string, value4: unknown) => {
                        calls.push({ method: "is", key: key4, value: value4 })
                        return {
                          maybeSingle: async () => result,
                        }
                      },
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

function makeSupabaseRpc(result: { error: { message: string; code?: string } | null }, calls: Array<{ fn: string; args: Record<string, unknown> }>) {
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args })
      return result
    },
  } as unknown as SupabaseClient
}

describe("getActiveMasterImage", () => {
  it("returns query error when DB select fails", async () => {
    const calls: Array<{ method: "eq" | "is"; key: string; value: unknown }> = []
    const supabase = makeSupabase({ data: null, error: { message: "boom" } }, calls)

    const out = await getActiveMasterImage(supabase, "proj-1")

    expect(out).toEqual({ image: null, error: "boom" })
    expect(calls).toEqual([
      { method: "eq", key: "project_id", value: "proj-1" },
      { method: "eq", key: "role", value: "master" },
      { method: "eq", key: "is_active", value: true },
      { method: "is", key: "deleted_at", value: null },
    ])
  })

  it("returns active image id even when storage_path is missing", async () => {
    const calls: Array<{ method: "eq" | "is"; key: string; value: unknown }> = []
    const supabase = makeSupabase(
      {
        data: {
          id: "img-active",
          storage_path: null,
          storage_bucket: null,
          name: null,
          width_px: null,
          height_px: null,
        },
        error: null,
      },
      calls
    )

    const out = await getActiveMasterImageId(supabase, "proj-id")
    expect(out).toEqual({ imageId: "img-active", error: null })
  })

  it("returns null image id when there is no active row", async () => {
    const calls: Array<{ method: "eq" | "is"; key: string; value: unknown }> = []
    const supabase = makeSupabase({ data: null, error: null }, calls)
    const out = await getActiveMasterImageId(supabase, "proj-none")
    expect(out).toEqual({ imageId: null, error: null })
  })

  it("maps query errors for active image id lookup", async () => {
    const calls: Array<{ method: "eq" | "is"; key: string; value: unknown }> = []
    const supabase = makeSupabase({ data: null, error: { message: "id lookup failed" } }, calls)
    const out = await getActiveMasterImageId(supabase, "proj-err")
    expect(out).toEqual({ imageId: null, error: "id lookup failed" })
  })

  it("returns null when no active row with storage path exists", async () => {
    const calls: Array<{ method: "eq" | "is"; key: string; value: unknown }> = []
    const supabase = makeSupabase(
      {
        data: {
          id: "img-1",
          storage_path: null,
          storage_bucket: null,
          name: "name",
          width_px: 100,
          height_px: 200,
        },
        error: null,
      },
      calls
    )

    const out = await getActiveMasterImage(supabase, "proj-2")
    expect(out).toEqual({ image: null, error: null })
  })

  it("maps active master row and defaults bucket", async () => {
    const calls: Array<{ method: "eq" | "is"; key: string; value: unknown }> = []
    const supabase = makeSupabase(
      {
        data: {
          id: "img-2",
          storage_path: "projects/p/images/i",
          storage_bucket: null,
          name: "My Image",
          width_px: 512,
          height_px: 256,
        },
        error: null,
      },
      calls
    )

    const out = await getActiveMasterImage(supabase, "proj-3")
    expect(out).toEqual({
      image: {
        id: "img-2",
        storagePath: "projects/p/images/i",
        storageBucket: PROJECT_IMAGES_BUCKET,
        name: "My Image",
        widthPx: 512,
        heightPx: 256,
      },
      error: null,
    })
  })

  it("calls set_active_master_with_state with normalized dimensions", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
    const supabase = makeSupabaseRpc({ error: null }, calls)

    const out = await activateMasterWithState({
      supabase,
      projectId: "proj-1",
      imageId: "img-1",
      widthPx: 400.8,
      heightPx: 0,
    })

    expect(out).toEqual({ ok: true })
    expect(calls).toEqual([
      {
        fn: "set_active_master_with_state",
        args: {
          p_project_id: "proj-1",
          p_image_id: "img-1",
          p_width_px: 400,
          p_height_px: 1,
        },
      },
    ])
  })

  it("maps rpc errors into active_switch failure shape", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
    const supabase = makeSupabaseRpc({ error: { message: "rpc failed", code: "P0001" } }, calls)

    const out = await activateMasterWithState({
      supabase,
      projectId: "proj-1",
      imageId: "img-1",
      widthPx: 10,
      heightPx: 20,
    })

    expect(out).toEqual({
      ok: false,
      stage: "active_switch",
      reason: "rpc failed",
      code: "P0001",
    })
  })
})

