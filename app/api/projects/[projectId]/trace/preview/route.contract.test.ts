import { describe, expect, it, vi } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { jsonRequest, routeParams, setupRouteMocks, TEST_UUIDS } from "@/lib/test/route-contract"

const params = { projectId: TEST_UUIDS.project }
const accessible = { tables: { projects: { select: { data: { id: TEST_UUIDS.project } } } } }

/** Mock the trace service module so the preview route runs without the
 * Python filter service. */
function mockTraceService(overrides: Record<string, unknown> = {}) {
  vi.doMock("@/services/editor/server/trace", () => ({
    previewProjectTrace: async () => ({ ok: true, svg: "<svg/>", width_px: 4, height_px: 4 }),
    ...overrides,
  }))
}

describe("/api/projects/[projectId]/trace/preview contract", () => {
  it("POST rejects unauthenticated requests with 401", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    mockTraceService()
    const mod = await import("./route")

    const res = await mod.POST(jsonRequest({ kind: "linerate" }), routeParams(params))
    expect(res.status).toBe(401)
  })

  it("POST returns 403 when the project is not accessible", async () => {
    setupRouteMocks({ supabase: makeMockSupabase({ tables: { projects: { select: { data: null } } } }) })
    mockTraceService()
    const mod = await import("./route")

    const res = await mod.POST(jsonRequest({ kind: "linerate" }), routeParams(params))
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
    mockTraceService({ previewProjectTrace: async () => ({ ok: false, reason: "linerate only", status: 400, stage: "validation", code: "K" }) })
    const mod = await import("./route")

    const res = await mod.POST(jsonRequest({ kind: "pixelate" }), routeParams(params))
    expect(res.status).toBe(400)
    expect((await res.json()).stage).toBe("validation")
  })

  it("POST returns the SVG payload on success", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(accessible) })
    mockTraceService()
    const mod = await import("./route")

    const res = await mod.POST(jsonRequest({ kind: "linerate", params: {} }), routeParams(params))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.svg).toBe("<svg/>")
    expect(body.width_px).toBe(4)
    expect(body.height_px).toBe(4)
  })
})
