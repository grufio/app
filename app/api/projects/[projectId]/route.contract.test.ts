import { describe, expect, it } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { routeParams, setupRouteMocks, TEST_UUIDS } from "@/lib/test/route-contract"

describe("DELETE /api/projects/[projectId] contract", () => {
  it("rejects unauthenticated requests with 401", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    const mod = await import("./route")

    const res = await mod.DELETE(new Request("http://test.local"), routeParams({ projectId: TEST_UUIDS.project }))
    expect(res.status).toBe(401)
  })

  it("rejects a non-UUID projectId with 400 validation", async () => {
    setupRouteMocks({ supabase: makeMockSupabase() })
    const mod = await import("./route")

    const res = await mod.DELETE(new Request("http://test.local"), routeParams({ projectId: "not-a-uuid" }))
    expect(res.status).toBe(400)
    expect((await res.json()).stage).toBe("validation")
  })

  it("maps RPC P0002 (not found) to 404", async () => {
    setupRouteMocks({
      supabase: makeMockSupabase({ rpcs: { delete_project: { data: null, error: { message: "row not found", code: "P0002" } } } }),
    })
    const mod = await import("./route")

    const res = await mod.DELETE(new Request("http://test.local"), routeParams({ projectId: TEST_UUIDS.project }))
    expect(res.status).toBe(404)
  })

  it("maps other RPC errors to 400", async () => {
    setupRouteMocks({
      supabase: makeMockSupabase({ rpcs: { delete_project: { data: null, error: { message: "boom", code: "XX000" } } } }),
    })
    const mod = await import("./route")

    const res = await mod.DELETE(new Request("http://test.local"), routeParams({ projectId: TEST_UUIDS.project }))
    expect(res.status).toBe(400)
  })

  it("returns 404 when the RPC reports no rows affected", async () => {
    setupRouteMocks({ supabase: makeMockSupabase({ rpcs: { delete_project: { data: false, error: null } } }) })
    const mod = await import("./route")

    const res = await mod.DELETE(new Request("http://test.local"), routeParams({ projectId: TEST_UUIDS.project }))
    expect(res.status).toBe(404)
  })

  it("returns ok:true on a successful delete", async () => {
    setupRouteMocks({ supabase: makeMockSupabase({ rpcs: { delete_project: { data: true, error: null } } }) })
    const mod = await import("./route")

    const res = await mod.DELETE(new Request("http://test.local"), routeParams({ projectId: TEST_UUIDS.project }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
