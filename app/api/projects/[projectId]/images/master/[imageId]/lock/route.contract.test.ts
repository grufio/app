import { describe, expect, it } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { jsonRequest, routeParams, setupRouteMocks, TEST_UUIDS } from "@/lib/test/route-contract"

const params = { projectId: TEST_UUIDS.project, imageId: TEST_UUIDS.image }

describe("PATCH /api/projects/[projectId]/images/master/[imageId]/lock contract", () => {
  it("rejects non-UUID params with 400 (before auth)", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    const mod = await import("./route")

    const res = await mod.PATCH(jsonRequest({ is_locked: true }, "PATCH"), routeParams({ projectId: "bad", imageId: "bad" }))
    expect(res.status).toBe(400)
    expect((await res.json()).stage).toBe("validation")
  })

  it("rejects a non-boolean is_locked with 400 validation", async () => {
    setupRouteMocks({ supabase: makeMockSupabase() })
    const mod = await import("./route")

    const res = await mod.PATCH(jsonRequest({}, "PATCH"), routeParams(params))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.stage).toBe("validation")
    expect(body.where).toBe("body")
  })

  it("rejects unauthenticated requests with 401", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    const mod = await import("./route")

    const res = await mod.PATCH(jsonRequest({ is_locked: true }, "PATCH"), routeParams(params))
    expect(res.status).toBe(401)
  })

  it("returns 403 rls_denied when the project is not accessible", async () => {
    setupRouteMocks({ supabase: makeMockSupabase({ tables: { projects: { select: { data: null } } } }) })
    const mod = await import("./route")

    const res = await mod.PATCH(jsonRequest({ is_locked: true }, "PATCH"), routeParams(params))
    expect(res.status).toBe(403)
    expect((await res.json()).stage).toBe("rls_denied")
  })

  it("returns 404 when the master image row is missing", async () => {
    setupRouteMocks({
      supabase: makeMockSupabase({
        tables: { projects: { select: { data: { id: TEST_UUIDS.project } } }, project_images: { select: { data: null } } },
      }),
    })
    const mod = await import("./route")

    const res = await mod.PATCH(jsonRequest({ is_locked: true }, "PATCH"), routeParams(params))
    expect(res.status).toBe(404)
  })

  it("updates the lock flag and echoes it on success", async () => {
    setupRouteMocks({
      supabase: makeMockSupabase({
        tables: {
          projects: { select: { data: { id: TEST_UUIDS.project } } },
          project_images: { select: { data: { id: TEST_UUIDS.image } }, update: { data: null, error: null } },
        },
      }),
    })
    const mod = await import("./route")

    const res = await mod.PATCH(jsonRequest({ is_locked: true }, "PATCH"), routeParams(params))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, id: TEST_UUIDS.image, is_locked: true })
  })
})
