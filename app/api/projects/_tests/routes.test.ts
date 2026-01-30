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

  it("master upload route rejects invalid UUID params", async () => {
    const mod = await import("../[projectId]/images/master/upload/route")
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

  it("master image signed URL cache is user-scoped", async () => {
    vi.resetModules()

    let currentUserId = "userA"
    const signedCalls: Array<{ userId: string }> = []

    vi.mock("@/lib/supabase/server", () => {
      const makeSupabase = () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: currentUserId } } }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
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

