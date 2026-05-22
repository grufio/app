import { NextResponse } from "next/server"
import { describe, expect, it, vi } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { setupRouteMocks, TEST_UUIDS } from "@/lib/test/route-contract"

async function importWrapper() {
  return import("@/lib/api/with-project-route-auth")
}

const okHandler = vi.fn(async (_req: Request, ctx: { userId: string }) =>
  NextResponse.json({ ok: true, userId: ctx.userId }),
)

describe("withProjectRouteAuth", () => {
  it("rejects a non-UUID projectId with 400 before any DB call", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    const { withProjectRouteAuth } = await importWrapper()

    const res = await withProjectRouteAuth(new Request("http://test.local"), "bad", okHandler)
    expect(res.status).toBe(400)
    expect((await res.json()).stage).toBe("validation")
  })

  it("rejects unauthenticated requests with 401", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    const { withProjectRouteAuth } = await importWrapper()

    const res = await withProjectRouteAuth(new Request("http://test.local"), TEST_UUIDS.project, okHandler)
    expect(res.status).toBe(401)
  })

  it("returns 400 project_access when the access check errors", async () => {
    setupRouteMocks({ supabase: makeMockSupabase({ tables: { projects: { select: { error: { message: "db down" } } } } }) })
    const { withProjectRouteAuth } = await importWrapper()

    const res = await withProjectRouteAuth(new Request("http://test.local"), TEST_UUIDS.project, okHandler)
    expect(res.status).toBe(400)
    expect((await res.json()).stage).toBe("project_access")
  })

  it("returns 403 rls_denied when the project is not visible", async () => {
    setupRouteMocks({ supabase: makeMockSupabase({ tables: { projects: { select: { data: null } } } }) })
    const { withProjectRouteAuth } = await importWrapper()

    const res = await withProjectRouteAuth(new Request("http://test.local"), TEST_UUIDS.project, okHandler)
    expect(res.status).toBe(403)
    expect((await res.json()).stage).toBe("rls_denied")
  })

  it("invokes the handler with a typed context on success", async () => {
    setupRouteMocks({ supabase: makeMockSupabase({ tables: { projects: { select: { data: { id: TEST_UUIDS.project } } } } }) })
    const { withProjectRouteAuth } = await importWrapper()

    const res = await withProjectRouteAuth(new Request("http://test.local"), TEST_UUIDS.project, okHandler)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, userId: TEST_UUIDS.user })
  })
})
