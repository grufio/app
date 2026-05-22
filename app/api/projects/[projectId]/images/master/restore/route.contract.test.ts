import { describe, expect, it } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { routeParams, setupRouteMocks, TEST_UUIDS } from "@/lib/test/route-contract"

const params = { projectId: TEST_UUIDS.project }

// The restore handler runs several `project_images` selects in sequence.
// The active-image lookup filters on `is_active`; the base-master lookup
// adds `.order().limit()`. Branch on whether `limit` was used so one
// mock can serve both reads with different rows.
function projectImagesByQuery(active: unknown, base: unknown) {
  return {
    projects: { select: { data: { id: TEST_UUIDS.project } } },
    project_images: {
      select: (chain: { ops: string[] }) => (chain.ops.includes("limit") ? { data: base } : { data: active }),
    },
  }
}

describe("POST /api/projects/[projectId]/images/master/restore contract", () => {
  it("rejects a non-UUID projectId with 400 (before auth)", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    const mod = await import("./route")

    const res = await mod.POST(new Request("http://test.local", { method: "POST" }), routeParams({ projectId: "bad" }))
    expect(res.status).toBe(400)
  })

  it("rejects unauthenticated requests with 401", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    const mod = await import("./route")

    const res = await mod.POST(new Request("http://test.local", { method: "POST" }), routeParams(params))
    expect(res.status).toBe(401)
  })

  it("returns 403 when the project is not accessible", async () => {
    setupRouteMocks({ supabase: makeMockSupabase({ tables: { projects: { select: { data: null } } } }) })
    const mod = await import("./route")

    const res = await mod.POST(new Request("http://test.local", { method: "POST" }), routeParams(params))
    expect(res.status).toBe(403)
  })

  it("returns 409 lock_conflict when the active image is locked", async () => {
    setupRouteMocks({
      supabase: makeMockSupabase({ tables: projectImagesByQuery({ id: TEST_UUIDS.image, is_locked: true }, null) }),
    })
    const mod = await import("./route")

    const res = await mod.POST(new Request("http://test.local", { method: "POST" }), routeParams(params))
    expect(res.status).toBe(409)
    expect((await res.json()).stage).toBe("lock_conflict")
  })

  it("returns 404 when the initial master image is missing", async () => {
    setupRouteMocks({
      supabase: makeMockSupabase({ tables: projectImagesByQuery({ id: TEST_UUIDS.image, is_locked: false }, null) }),
    })
    const mod = await import("./route")

    const res = await mod.POST(new Request("http://test.local", { method: "POST" }), routeParams(params))
    expect(res.status).toBe(404)
    expect((await res.json()).stage).toBe("restore_base_missing")
  })
})
