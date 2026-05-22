import { describe, expect, it, vi } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { jsonRequest, routeParams, setupRouteMocks, TEST_UUIDS } from "@/lib/test/route-contract"

const params = { projectId: TEST_UUIDS.project }

function mockCrop(result: unknown) {
  vi.doMock("@/services/editor/server/crop-image", () => ({ cropImageAndActivate: async () => result }))
}

const validBody = { source_image_id: TEST_UUIDS.image, x: 0, y: 0, w: 10, h: 10 }

describe("POST /api/projects/[projectId]/images/crop contract", () => {
  it("rejects a non-UUID projectId with 400 (before auth)", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    mockCrop({ ok: true })
    const mod = await import("./route")

    const res = await mod.POST(jsonRequest(validBody), routeParams({ projectId: "bad" }))
    expect(res.status).toBe(400)
  })

  it("rejects unauthenticated requests with 401", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    mockCrop({ ok: true })
    const mod = await import("./route")

    const res = await mod.POST(jsonRequest(validBody), routeParams(params))
    expect(res.status).toBe(401)
  })

  it("returns 403 when the project is not accessible", async () => {
    setupRouteMocks({ supabase: makeMockSupabase({ tables: { projects: { select: { data: null } } } }) })
    mockCrop({ ok: true })
    const mod = await import("./route")

    const res = await mod.POST(jsonRequest(validBody), routeParams(params))
    expect(res.status).toBe(403)
  })

  it("rejects a non-UUID source_image_id with 400 validation", async () => {
    setupRouteMocks({ supabase: makeMockSupabase({ tables: { projects: { select: { data: { id: TEST_UUIDS.project } } } } }) })
    mockCrop({ ok: true })
    const mod = await import("./route")

    const res = await mod.POST(jsonRequest({ ...validBody, source_image_id: "bad" }), routeParams(params))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.stage).toBe("validation")
    expect(body.where).toBe("body")
  })

  it("maps a service failure to its status + stage", async () => {
    setupRouteMocks({ supabase: makeMockSupabase({ tables: { projects: { select: { data: { id: TEST_UUIDS.project } } } } }) })
    mockCrop({ ok: false, reason: "crop out of bounds", status: 422, stage: "crop_failed", code: "OOB" })
    const mod = await import("./route")

    const res = await mod.POST(jsonRequest(validBody), routeParams(params))
    expect(res.status).toBe(422)
    expect((await res.json()).stage).toBe("crop_failed")
  })

  it("returns the new image metadata on success", async () => {
    setupRouteMocks({ supabase: makeMockSupabase({ tables: { projects: { select: { data: { id: TEST_UUIDS.project } } } } }) })
    mockCrop({ ok: true, id: TEST_UUIDS.image, storagePath: "crop.png", widthPx: 10, heightPx: 10 })
    const mod = await import("./route")

    const res = await mod.POST(jsonRequest(validBody), routeParams(params))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      id: TEST_UUIDS.image,
      storage_path: "crop.png",
      width_px: 10,
      height_px: 10,
    })
  })
})
