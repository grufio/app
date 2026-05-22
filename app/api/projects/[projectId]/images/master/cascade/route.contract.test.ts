import { describe, expect, it } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { routeParams, setupRouteMocks, TEST_UUIDS } from "@/lib/test/route-contract"

const params = { projectId: TEST_UUIDS.project }

describe("DELETE /api/projects/[projectId]/images/master/cascade contract", () => {
  it("rejects a non-UUID projectId with 400 (before auth)", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    const mod = await import("./route")

    const res = await mod.DELETE(new Request("http://test.local"), routeParams({ projectId: "bad" }))
    expect(res.status).toBe(400)
  })

  it("rejects unauthenticated requests with 401", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    const mod = await import("./route")

    const res = await mod.DELETE(new Request("http://test.local"), routeParams(params))
    expect(res.status).toBe(401)
  })

  it("returns 403 when the project is not accessible", async () => {
    setupRouteMocks({ supabase: makeMockSupabase({ tables: { projects: { select: { data: null } } } }) })
    const mod = await import("./route")

    const res = await mod.DELETE(new Request("http://test.local"), routeParams(params))
    expect(res.status).toBe(403)
    expect((await res.json()).stage).toBe("rls_denied")
  })

  it("maps an RPC failure to 500", async () => {
    setupRouteMocks({
      supabase: makeMockSupabase({
        tables: { projects: { select: { data: { id: TEST_UUIDS.project } } } },
        rpcs: { delete_master_with_cascade: { data: null, error: { message: "boom" } } },
      }),
    })
    const mod = await import("./route")

    const res = await mod.DELETE(new Request("http://test.local"), routeParams(params))
    expect(res.status).toBe(500)
    expect((await res.json()).stage).toBe("rpc")
  })

  it("reports deleted_count and cleans up storage on success", async () => {
    setupRouteMocks({
      supabase: makeMockSupabase({
        tables: { projects: { select: { data: { id: TEST_UUIDS.project } } } },
        rpcs: {
          delete_master_with_cascade: {
            data: [{ storage_bucket: "project_images", storage_path: "a.png" }],
            error: null,
          },
        },
      }),
    })
    const mod = await import("./route")

    const res = await mod.DELETE(new Request("http://test.local"), routeParams(params))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.deleted_count).toBe(1)
    expect(body.storage_cleanup_failures).toEqual([])
  })
})
