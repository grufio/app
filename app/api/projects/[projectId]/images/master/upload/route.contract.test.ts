import { describe, expect, it, vi } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { routeParams, setupRouteMocks, TEST_UUIDS } from "@/lib/test/route-contract"

const params = { projectId: TEST_UUIDS.project }

function mockUpload(result: unknown) {
  vi.doMock("@/services/editor/server/master-image-upload", () => ({ uploadMasterImage: async () => result }))
}

function formRequest(fields: Record<string, string | File>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return new Request("http://test.local", { method: "POST", body: fd })
}

const pngFile = () => new File([new Uint8Array([1, 2, 3, 4])], "x.png", { type: "image/png" })
const accessibleProject = { tables: { projects: { select: { data: { id: TEST_UUIDS.project } } } } }

describe("POST /api/projects/[projectId]/images/master/upload contract", () => {
  it("rejects a non-UUID projectId with 400 (before auth)", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    mockUpload({ ok: true })
    const mod = await import("./route")

    const res = await mod.POST(formRequest({ file: pngFile() }), routeParams({ projectId: "bad" }))
    expect(res.status).toBe(400)
  })

  it("rejects unauthenticated requests with 401", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(), authed: false })
    mockUpload({ ok: true })
    const mod = await import("./route")

    const res = await mod.POST(formRequest({ file: pngFile() }), routeParams(params))
    expect(res.status).toBe(401)
  })

  it("returns 403 when the project is not accessible", async () => {
    setupRouteMocks({ supabase: makeMockSupabase({ tables: { projects: { select: { data: null } } } }) })
    mockUpload({ ok: true })
    const mod = await import("./route")

    const res = await mod.POST(formRequest({ file: pngFile() }), routeParams(params))
    expect(res.status).toBe(403)
  })

  it("rejects a missing file with 400 validation", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(accessibleProject) })
    mockUpload({ ok: true })
    const mod = await import("./route")

    const res = await mod.POST(formRequest({ width_px: "100", height_px: "50" }), routeParams(params))
    expect(res.status).toBe(400)
    expect((await res.json()).stage).toBe("validation")
  })

  // Dimension/DPI validation moved into the service (server-side sharp on
  // the file bytes); the route no longer parses or validates them, so there
  // is no route-level "non-finite dimensions" rejection. The unreadable-file
  // path is covered in master-image-upload.test.ts.

  it("maps a service failure to its status + stage", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(accessibleProject) })
    mockUpload({ ok: false, reason: "too large", status: 413, stage: "too_large", code: "SZ", details: {} })
    const mod = await import("./route")

    const res = await mod.POST(
      formRequest({ file: pngFile(), width_px: "100", height_px: "50" }),
      routeParams(params),
    )
    expect(res.status).toBe(413)
    expect((await res.json()).stage).toBe("too_large")
  })

  it("returns the stored image metadata on success", async () => {
    setupRouteMocks({ supabase: makeMockSupabase(accessibleProject) })
    mockUpload({ ok: true, id: TEST_UUIDS.image, storagePath: "m.png", master: { id: TEST_UUIDS.image } })
    const mod = await import("./route")

    const res = await mod.POST(
      formRequest({ file: pngFile(), width_px: "100", height_px: "50", dpi: "300", format: "png" }),
      routeParams(params),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.id).toBe(TEST_UUIDS.image)
    expect(body.storage_path).toBe("m.png")
  })
})
