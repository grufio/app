import { afterEach, describe, expect, it, vi } from "vitest"

import { jsonRequest, routeParams, setupRouteMocks, TEST_UUIDS } from "@/lib/test/route-contract"

/** Supabase stub answering only the project-access `.from("projects").select().eq().single()`. */
function projectAccessSupabase(found: boolean) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            found ? { data: { id: TEST_UUIDS.project }, error: null } : { data: null, error: { message: "denied" } },
        }),
      }),
    }),
  }
}

function mockFinalize(result: unknown) {
  vi.doMock("@/services/editor/server/master-image-upload", () => ({
    finalizeMasterImageUpload: async () => result,
  }))
}

const VALID_BODY = { imageId: TEST_UUIDS.image, fileName: "x.png", format: "png" }

async function loadRoute() {
  return import("./route")
}

afterEach(() => vi.resetModules())

describe("master/finalize route contract", () => {
  it("rejects an invalid projectId before auth", async () => {
    setupRouteMocks({ supabase: {} })
    const { POST } = await loadRoute()
    const res = await POST(jsonRequest(VALID_BODY), routeParams({ projectId: "nope" }))
    expect(res.status).toBe(400)
    expect((await res.json()).stage).toBe("validation")
  })

  it("rejects a non-UUID imageId (path-traversal guard)", async () => {
    setupRouteMocks({ supabase: {} })
    const { POST } = await loadRoute()
    const res = await POST(jsonRequest({ ...VALID_BODY, imageId: "../evil" }), routeParams({ projectId: TEST_UUIDS.project }))
    expect(res.status).toBe(400)
    expect((await res.json()).where).toBe("body")
  })

  it("returns 401 when unauthenticated", async () => {
    setupRouteMocks({ supabase: projectAccessSupabase(true), authed: false })
    const { POST } = await loadRoute()
    const res = await POST(jsonRequest(VALID_BODY), routeParams({ projectId: TEST_UUIDS.project }))
    expect(res.status).toBe(401)
  })

  it("returns 403 when the project is not accessible (RLS)", async () => {
    setupRouteMocks({ supabase: projectAccessSupabase(false) })
    const { POST } = await loadRoute()
    const res = await POST(jsonRequest(VALID_BODY), routeParams({ projectId: TEST_UUIDS.project }))
    expect(res.status).toBe(403)
    expect((await res.json()).stage).toBe("rls_denied")
  })

  it("maps a service failure to the response status + stage", async () => {
    setupRouteMocks({ supabase: projectAccessSupabase(true) })
    mockFinalize({ ok: false, status: 413, stage: "upload_limits", reason: "Upload too large", details: { max_bytes: 1 } })
    const { POST } = await loadRoute()
    const res = await POST(jsonRequest(VALID_BODY), routeParams({ projectId: TEST_UUIDS.project }))
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.stage).toBe("upload_limits")
    expect(body.error).toContain("Upload too large")
  })

  it("returns the master snapshot on success", async () => {
    setupRouteMocks({ supabase: projectAccessSupabase(true) })
    mockFinalize({
      ok: true,
      id: TEST_UUIDS.image,
      storagePath: `projects/${TEST_UUIDS.project}/images/${TEST_UUIDS.image}`,
      master: { id: TEST_UUIDS.image, signedUrl: "https://signed/x" },
    })
    const { POST } = await loadRoute()
    const res = await POST(jsonRequest(VALID_BODY), routeParams({ projectId: TEST_UUIDS.project }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.master.signedUrl).toBe("https://signed/x")
  })
})
