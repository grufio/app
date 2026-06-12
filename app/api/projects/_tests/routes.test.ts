/**
 * Unit tests for selected API route handlers (no network, mocked Supabase).
 *
 * Focus:
 * - Param validation returns consistent `{ error, stage }` shapes.
 * - Master image signed URL cache is user-scoped.
 */
import { describe, expect, it, vi } from "vitest"

const VALID_UUID = "c104be01-d7b0-4af4-a446-8326cd47a282"

describe("API routes", () => {
  it("master image route rejects invalid UUID params", async () => {
    const mod = await import("../[projectId]/images/master/route")
    const res = await mod.GET(new Request("http://test.local"), { params: Promise.resolve({ projectId: "nope" }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.stage).toBe("validation")
  })

  it("master finalize route rejects invalid UUID params", async () => {
    const mod = await import("../[projectId]/images/master/finalize/route")
    const res = await mod.POST(new Request("http://test.local", { method: "POST" }), { params: Promise.resolve({ projectId: "nope" }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.stage).toBe("validation")
  })

  it("image-state route rejects invalid UUID params", async () => {
    const mod = await import("../[projectId]/image-state/route")
    const res = await mod.POST(new Request("http://test.local", { method: "POST" }), { params: Promise.resolve({ projectId: "nope" }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.stage).toBe("validation")
  })

  it("master GET returns masterRowId on the cache-miss path and identically on the cache-hit path", async () => {
    // Regression guard for the incomplete PR #267 fix: `masterRowId` (the
    // immutable kind='master' row id used as the client master-transition
    // key for the authoritative display source `useDisplaySize`) was only
    // added to the cache-hit return. The cache-miss return (first request on
    // a cold serverless instance, e.g. the first refreshMasterImage after
    // editor boot) shipped without it → client coerced it to null →
    // transition cascade discarded the persisted display transform. Both
    // return paths must carry masterRowId and produce an identical shape.
    vi.resetModules()

    // Distinct ids prove masterRowId comes from the kind='master' row, NOT the
    // active editor target (which flips on filter/crop/trace apply).
    const ACTIVE_IMAGE_ID = "active-image-id"
    const MASTER_ROW_ID = "master-row-id"
    let signedCount = 0

    vi.doMock("@/lib/supabase/server", () => {
      const makeSupabase = () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: "ownerX" } } }),
        },
        from: (table: string) => {
          if (table === "projects") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: VALID_UUID }, error: null }),
                }),
              }),
            }
          }
          // project_images: two distinct selects on the same chain shape.
          //  - active image: ...eq(is_active,true).is(deleted_at).maybeSingle()
          //  - master restore_base: ...eq(kind,master).is(deleted_at).order().limit().maybeSingle()
          // We branch the terminal: the master query goes through .order().limit().
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    // Active-image terminal (no order/limit).
                    maybeSingle: async () => ({
                      data: {
                        id: ACTIVE_IMAGE_ID,
                        storage_path: "projects/ownerX/master/file.png",
                        storage_bucket: "project_images",
                        name: "file.png",
                        format: "png",
                        width_px: 10,
                        height_px: 10,
                        dpi: 72,
                        file_size_bytes: 1,
                        is_active: true,
                      },
                      error: null,
                    }),
                    // Master restore_base terminal (order → limit → maybeSingle).
                    order: () => ({
                      limit: () => ({
                        maybeSingle: async () => ({
                          data: {
                            id: MASTER_ROW_ID,
                            width_px: 10,
                            height_px: 10,
                            dpi: 72,
                          },
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }
        },
        storage: {
          from: () => ({
            createSignedUrl: async () => {
              signedCount += 1
              return { data: { signedUrl: `signed-${signedCount}` }, error: null }
            },
          }),
        },
      })
      return { createSupabaseServerClient: async () => makeSupabase() }
    })

    const mod = await import("../[projectId]/images/master/route")

    // First request → cold module cache → cache-MISS path (signs a fresh URL).
    const resMiss = await mod.GET(new Request("http://test.local"), {
      params: Promise.resolve({ projectId: VALID_UUID }),
    })
    expect(resMiss.status).toBe(200)
    const bodyMiss = await resMiss.json()
    expect(signedCount).toBe(1) // proves we actually hit the miss path
    expect(bodyMiss.signedUrl).toBe("signed-1")
    expect(bodyMiss.masterRowId).toBe(MASTER_ROW_ID)
    // masterRowId must be the master row, not the active editor target.
    expect(bodyMiss.id).toBe(ACTIVE_IMAGE_ID)
    expect(bodyMiss.masterRowId).not.toBe(bodyMiss.id)

    // Second request (same user/bucket/path) → cache-HIT path (no re-sign).
    const resHit = await mod.GET(new Request("http://test.local"), {
      params: Promise.resolve({ projectId: VALID_UUID }),
    })
    expect(resHit.status).toBe(200)
    const bodyHit = await resHit.json()
    expect(signedCount).toBe(1) // no new sign → confirms cache hit
    expect(bodyHit.signedUrl).toBe("signed-1")
    expect(bodyHit.masterRowId).toBe(MASTER_ROW_ID)

    // Both paths must produce an identical shape (only signedUrl may differ,
    // and here it doesn't because the cache returns the same URL).
    expect(bodyHit).toEqual(bodyMiss)
  })

  it("master image signed URL cache is user-scoped", async () => {
    vi.resetModules()

    let currentUserId = "userA"
    const signedCalls: Array<{ userId: string }> = []

    vi.doMock("@/lib/supabase/server", () => {
      const makeSupabase = () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: currentUserId } } }),
        },
        from: (table: string) => {
          if (table === "projects") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: VALID_UUID }, error: null }),
                }),
              }),
            }
          }
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    maybeSingle: async () => ({
                      data: {
                        storage_path: "projects/shared/master/file.png",
                        name: "file.png",
                        format: "png",
                        width_px: 10,
                        height_px: 10,
                        file_size_bytes: 1,
                      },
                      error: null,
                    }),
                    order: () => ({
                      limit: () => ({
                        maybeSingle: async () => ({
                          data: {
                            storage_path: "projects/shared/master/file.png",
                            name: "file.png",
                            format: "png",
                            width_px: 10,
                            height_px: 10,
                            file_size_bytes: 1,
                          },
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }
        },
        storage: {
          from: () => ({
            createSignedUrl: async () => {
              signedCalls.push({ userId: currentUserId })
              return { data: { signedUrl: `signed-for-${currentUserId}` }, error: null }
            },
          }),
        },
      })
      return { createSupabaseServerClient: async () => makeSupabase() }
    })

    const mod = await import("../[projectId]/images/master/route")

    currentUserId = "userA"
    const resA = await mod.GET(new Request("http://test.local"), { params: Promise.resolve({ projectId: VALID_UUID }) })
    expect(resA.status).toBe(200)
    const bodyA = await resA.json()
    expect(bodyA.signedUrl).toBe("signed-for-userA")

    currentUserId = "userB"
    const resB = await mod.GET(new Request("http://test.local"), { params: Promise.resolve({ projectId: VALID_UUID }) })
    expect(resB.status).toBe(200)
    const bodyB = await resB.json()
    expect(bodyB.signedUrl).toBe("signed-for-userB")

    expect(signedCalls.map((c) => c.userId)).toEqual(["userA", "userB"])
  })
})

