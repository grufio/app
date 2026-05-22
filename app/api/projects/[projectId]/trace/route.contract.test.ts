import { describe, expect, it, vi } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { jsonRequest, routeParams, setupRouteMocks, TEST_UUIDS } from "@/lib/test/route-contract"

const params = { projectId: TEST_UUIDS.project }
const accessible = { tables: { projects: { select: { data: { id: TEST_UUIDS.project } } } } }

/** Mock the trace service module. `base_image_id: null` keeps the
 * route's `resolveTraceBaseImage` from touching storage. */
function mockTraceService(overrides: Record<string, unknown> = {}) {
  vi.doMock("@/services/editor/server/trace", () => ({
    getProjectTrace: async () => ({ ok: true, trace: { base_image_id: null } }),
    applyProjectTrace: async () => ({ ok: true, trace: { base_image_id: null }, image_id: TEST_UUIDS.image, width_px: 4, height_px: 4 }),
    clearProjectTrace: async () => ({ ok: true, active_image_id: TEST_UUIDS.image }),
    ...overrides,
  }))
}

describe("/api/projects/[projectId]/trace contract", () => {
  it("GET rejects a non-UUID projectId with 400", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    mockTraceService()
    const mod = await import("./route")

    const res = await mod.GET(new Request("http://test.local"), routeParams({ projectId: "bad" }))
    expect(res.status).toBe(400)
  })

  it("POST rejects unauthenticated requests with 401", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    mockTraceService()
    const mod = await import("./route")

    const res = await mod.POST(jsonRequest({ kind: "pixelate" }), routeParams(params))
    expect(res.status).toBe(401)
  })

  it("POST returns 403 when the project is not accessible", async () => {
    setupRouteMocks({ supabase: makeMockSupabase({ tables: { projects: { select: { data: null } } } }) })
    mockTraceService()
    const mod = await import("./route")

    const res = await mod.POST(jsonRequest({ kind: "pixelate" }), routeParams(params))
    expect(res.status).toBe(403)
  })

  it("POST rejects invalid JSON with 400 validation", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(accessible) })
    mockTraceService()
    const mod = await import("./route")

    const res = await mod.POST(new Request("http://test.local", { method: "POST", body: "{nope" }), routeParams(params))
    expect(res.status).toBe(400)
    expect((await res.json()).stage).toBe("validation")
  })

  it("POST maps a service failure to its status + stage", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(accessible) })
    mockTraceService({ applyProjectTrace: async () => ({ ok: false, reason: "bad kind", status: 422, stage: "trace_failed", code: "K" }) })
    const mod = await import("./route")

    const res = await mod.POST(jsonRequest({ kind: "nope" }), routeParams(params))
    expect(res.status).toBe(422)
    expect((await res.json()).stage).toBe("trace_failed")
  })

  it("POST returns the trace payload on success", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(accessible) })
    mockTraceService()
    const mod = await import("./route")

    const res = await mod.POST(jsonRequest({ kind: "pixelate", params: {} }), routeParams(params))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.image_id).toBe(TEST_UUIDS.image)
    expect(body.base_image).toBeNull()
  })

  it("GET returns the trace and a null base image", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(accessible) })
    mockTraceService()
    const mod = await import("./route")

    const res = await mod.GET(new Request("http://test.local"), routeParams(params))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, trace: { base_image_id: null }, base_image: null })
  })

  it("DELETE clears the trace and returns the fallback image", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(accessible) })
    mockTraceService()
    const mod = await import("./route")

    const res = await mod.DELETE(new Request("http://test.local", { method: "DELETE" }), routeParams(params))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, active_image_id: TEST_UUIDS.image })
  })
})
