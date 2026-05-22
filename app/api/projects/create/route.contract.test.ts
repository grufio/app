import { describe, expect, it, vi } from "vitest"

import { setupRouteMocks, TEST_UUIDS } from "@/lib/test/route-contract"

function mockCreateService(result: unknown) {
  vi.doMock("@/services/projects", () => ({
    createProjectWithWorkspace: async () => result,
  }))
}

describe("POST /api/projects/create contract", () => {
  it("rejects unauthenticated requests with 401", async () => {
    setupRouteMocks({ supabase: {}, authed: false })
    mockCreateService({ ok: true, projectId: TEST_UUIDS.project })
    const mod = await import("./route")

    const res = await mod.POST(
      new Request("http://test.local", { method: "POST", body: JSON.stringify({ name: "x" }) }),
    )
    expect(res.status).toBe(401)
    expect((await res.json()).stage).toBe("auth")
  })

  it("rejects invalid JSON with 400 validation", async () => {
    setupRouteMocks({ supabase: {} })
    mockCreateService({ ok: true, projectId: TEST_UUIDS.project })
    const mod = await import("./route")

    const res = await mod.POST(new Request("http://test.local", { method: "POST", body: "{not json" }))
    expect(res.status).toBe(400)
    expect((await res.json()).stage).toBe("validation")
  })

  it("maps a service failure to a 400 with the service stage", async () => {
    setupRouteMocks({ supabase: {} })
    mockCreateService({ ok: false, message: "workspace insert failed", stage: "workspace_insert" })
    const mod = await import("./route")

    const res = await mod.POST(
      new Request("http://test.local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "P", unit: "mm", width_value: 100, height_value: 50 }),
      }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).stage).toBe("workspace_insert")
  })

  it("returns the new project id on success", async () => {
    setupRouteMocks({ supabase: {} })
    mockCreateService({ ok: true, projectId: TEST_UUIDS.project })
    const mod = await import("./route")

    const res = await mod.POST(
      new Request("http://test.local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "P", unit: "mm", width_value: 100, height_value: 50 }),
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: TEST_UUIDS.project })
  })
})
