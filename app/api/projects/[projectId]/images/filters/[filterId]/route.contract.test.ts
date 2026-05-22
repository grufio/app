import { describe, expect, it, vi } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { jsonRequest, routeParams, setupRouteMocks, TEST_UUIDS } from "@/lib/test/route-contract"

const params = { projectId: TEST_UUIDS.project, filterId: TEST_UUIDS.filter }
const accessible = { tables: { projects: { select: { data: { id: TEST_UUIDS.project } } } } }

function mockRemove(result: unknown) {
  vi.doMock("@/services/editor/server/filter-variants", () => ({
    removeProjectImageFilter: async () => result,
  }))
}

describe("DELETE /api/projects/[projectId]/images/filters/[filterId] contract", () => {
  it("rejects a non-UUID projectId with 400 (wrapper)", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    mockRemove({ ok: true })
    const mod = await import("./route")

    const res = await mod.DELETE(new Request("http://test.local", { method: "DELETE" }), routeParams({ ...params, projectId: "bad" }))
    expect(res.status).toBe(400)
  })

  it("rejects unauthenticated requests with 401", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    mockRemove({ ok: true })
    const mod = await import("./route")

    const res = await mod.DELETE(new Request("http://test.local", { method: "DELETE" }), routeParams(params))
    expect(res.status).toBe(401)
  })

  it("rejects a non-UUID filterId with 400 validation", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(accessible) })
    mockRemove({ ok: true })
    const mod = await import("./route")

    const res = await mod.DELETE(new Request("http://test.local", { method: "DELETE" }), routeParams({ ...params, filterId: "bad" }))
    expect(res.status).toBe(400)
    expect((await res.json()).stage).toBe("validation")
  })

  it("maps a service failure to its status + stage", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(accessible) })
    mockRemove({ ok: false, reason: "not found", status: 404, stage: "filter_missing", code: "NF" })
    const mod = await import("./route")

    const res = await mod.DELETE(new Request("http://test.local", { method: "DELETE" }), routeParams(params))
    expect(res.status).toBe(404)
    expect((await res.json()).stage).toBe("filter_missing")
  })

  it("returns the new active image on success", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(accessible) })
    mockRemove({ ok: true, active_image_id: TEST_UUIDS.image })
    const mod = await import("./route")

    const res = await mod.DELETE(new Request("http://test.local", { method: "DELETE" }), routeParams(params))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, active_image_id: TEST_UUIDS.image })
  })
})

describe("PATCH /api/projects/[projectId]/images/filters/[filterId] contract", () => {
  it("rejects a non-boolean is_hidden with 400 validation", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(accessible) })
    const mod = await import("./route")

    const res = await mod.PATCH(jsonRequest({}, "PATCH"), routeParams(params))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.stage).toBe("validation")
    expect(body.where).toBe("body")
  })

  it("maps a DB update error to 400 filter_update", async () => {
    setupRouteMocks({
      supabase: makeMockSupabase({
        tables: {
          projects: { select: { data: { id: TEST_UUIDS.project } } },
          project_image_filters: { update: { error: { message: "fk", code: "23503" } } },
        },
      }),
    })
    const mod = await import("./route")

    const res = await mod.PATCH(jsonRequest({ is_hidden: true }, "PATCH"), routeParams(params))
    expect(res.status).toBe(400)
    expect((await res.json()).stage).toBe("filter_update")
  })

  it("toggles is_hidden on success", async () => {
    setupRouteMocks({
      supabase: makeMockSupabase({
        tables: {
          projects: { select: { data: { id: TEST_UUIDS.project } } },
          project_image_filters: { update: { error: null } },
        },
      }),
    })
    const mod = await import("./route")

    const res = await mod.PATCH(jsonRequest({ is_hidden: true }, "PATCH"), routeParams(params))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, is_hidden: true })
  })
})
