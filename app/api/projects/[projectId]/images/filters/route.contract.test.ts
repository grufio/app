import { describe, expect, it, vi } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { jsonRequest, routeParams, setupRouteMocks, TEST_UUIDS } from "@/lib/test/route-contract"

const params = { projectId: TEST_UUIDS.project }
const accessible = { tables: { projects: { select: { data: { id: TEST_UUIDS.project } } } } }

function mockFilterService(overrides: Record<string, unknown> = {}) {
  vi.doMock("@/services/editor/server/filter-variants", () => ({
    listProjectImageFilters: async () => ({ ok: true, items: [] }),
    applyProjectImageFilter: async () => ({ ok: true, item: { id: TEST_UUIDS.filter }, image_id: TEST_UUIDS.image, width_px: 8, height_px: 8 }),
    ...overrides,
  }))
}

describe("/api/projects/[projectId]/images/filters contract", () => {
  it("GET rejects a non-UUID projectId with 400", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    mockFilterService()
    const mod = await import("./route")

    const res = await mod.GET(new Request("http://test.local"), routeParams({ projectId: "bad" }))
    expect(res.status).toBe(400)
  })

  it("POST rejects unauthenticated requests with 401", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    mockFilterService()
    const mod = await import("./route")

    const res = await mod.POST(jsonRequest({ filter_type: "bw" }), routeParams(params))
    expect(res.status).toBe(401)
  })

  it("POST returns 403 when the project is not accessible", async () => {
    setupRouteMocks({ supabase: makeMockSupabase({ tables: { projects: { select: { data: null } } } }) })
    mockFilterService()
    const mod = await import("./route")

    const res = await mod.POST(jsonRequest({ filter_type: "bw" }), routeParams(params))
    expect(res.status).toBe(403)
  })

  it("POST rejects invalid JSON with 400 validation", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(accessible) })
    mockFilterService()
    const mod = await import("./route")

    const res = await mod.POST(new Request("http://test.local", { method: "POST", body: "{bad" }), routeParams(params))
    expect(res.status).toBe(400)
  })

  it("POST maps a service failure to its status + stage", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(accessible) })
    mockFilterService({ applyProjectImageFilter: async () => ({ ok: false, reason: "no source", status: 409, stage: "no_source", code: "NS" }) })
    const mod = await import("./route")

    const res = await mod.POST(jsonRequest({ filter_type: "bw", filter_params: {} }), routeParams(params))
    expect(res.status).toBe(409)
    expect((await res.json()).stage).toBe("no_source")
  })

  it("POST returns the applied filter on success", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(accessible) })
    mockFilterService()
    const mod = await import("./route")

    const res = await mod.POST(jsonRequest({ filter_type: "bw", filter_params: {} }), routeParams(params))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.image_id).toBe(TEST_UUIDS.image)
  })

  it("GET lists filters on success", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(accessible) })
    mockFilterService({ listProjectImageFilters: async () => ({ ok: true, items: [{ id: TEST_UUIDS.filter }] }) })
    const mod = await import("./route")

    const res = await mod.GET(new Request("http://test.local"), routeParams(params))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items: [{ id: TEST_UUIDS.filter }] })
  })
})
