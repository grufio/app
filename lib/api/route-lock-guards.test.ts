import { describe, expect, it, vi } from "vitest"

const VALID_UUID = "c104be01-d7b0-4af4-a446-8326cd47a282"
const IMAGE_UUID = "2e306bed-0f1a-4124-a1c7-2702d85c21e7"
const ACTIVE_IMAGE_UUID = "73eb09f8-b8f6-4956-b79b-5f7a4f1d7360"
const STALE_IMAGE_UUID = "6df68e6a-280f-4f3c-b5ac-c2eb34cc25cc"
const { getActiveMasterImageIdMock, upsertBoundImageStateMock } = vi.hoisted(() => ({
  getActiveMasterImageIdMock: vi.fn(),
  upsertBoundImageStateMock: vi.fn(),
}))

function makeLockRouteSupabase(args: { projectAccessible: boolean; imageExists: boolean }) {
  const { projectAccessible, imageExists } = args
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "u1" } } }),
    },
    from: (table: string) => {
      if (table === "projects") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: projectAccessible ? { id: VALID_UUID } : null,
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === "project_images") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    maybeSingle: async () => ({
                      data: imageExists ? { id: IMAGE_UUID } : null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  is: async () => ({ error: null }),
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }
}

function makeImageStateSupabaseLocked() {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "u1" } } }),
    },
    from: (table: string) => {
      if (table === "projects") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: VALID_UUID }, error: null }),
            }),
          }),
        }
      }
      if (table === "project_images") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({ data: { is_locked: true }, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }
}

function makeDeleteRouteSupabaseInactive() {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "u1" } } }),
    },
    from: (table: string) => {
      if (table === "projects") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: VALID_UUID }, error: null }),
            }),
          }),
        }
      }
      if (table === "project_images") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: IMAGE_UUID,
                        storage_bucket: "project_images",
                        storage_path: "path/file.png",
                        is_active: false,
                        is_locked: false,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
    storage: {
      from: () => ({
        remove: async () => ({ error: null }),
      }),
    },
    rpc: async () => ({ error: null }),
  }
}

describe("lock guard route contracts", () => {
  it("lock route returns project_access denial when project is not accessible", async () => {
    vi.resetModules()
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => makeLockRouteSupabase({ projectAccessible: false, imageExists: true }),
    }))

    const mod = await import("@/app/api/projects/[projectId]/images/master/[imageId]/lock/route")
    const req = new Request("http://test.local", {
      method: "PATCH",
      body: JSON.stringify({ is_locked: true }),
      headers: { "content-type": "application/json" },
    })
    const res = await mod.PATCH(req, { params: Promise.resolve({ projectId: VALID_UUID, imageId: IMAGE_UUID }) })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.stage).toBe("rls_denied")
    expect(body.where).toBe("project_access")
  })

  it("lock route returns resource_missing when image does not exist", async () => {
    vi.resetModules()
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => makeLockRouteSupabase({ projectAccessible: true, imageExists: false }),
    }))

    const mod = await import("@/app/api/projects/[projectId]/images/master/[imageId]/lock/route")
    const req = new Request("http://test.local", {
      method: "PATCH",
      body: JSON.stringify({ is_locked: true }),
      headers: { "content-type": "application/json" },
    })
    const res = await mod.PATCH(req, { params: Promise.resolve({ projectId: VALID_UUID, imageId: IMAGE_UUID }) })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.stage).toBe("lock_query")
  })

  it("image-state route returns lock_conflict 409 when active image is locked", async () => {
    vi.resetModules()
    getActiveMasterImageIdMock.mockReset()
    upsertBoundImageStateMock.mockReset()
    getActiveMasterImageIdMock.mockResolvedValue({ imageId: ACTIVE_IMAGE_UUID, error: null })

    vi.doMock("@/lib/supabase/project-images", () => ({
      getActiveMasterImageId: (...args: unknown[]) => getActiveMasterImageIdMock(...args),
    }))
    vi.doMock("@/lib/supabase/image-state", () => ({
      loadBoundImageState: vi.fn(),
      upsertBoundImageState: (...args: unknown[]) => upsertBoundImageStateMock(...args),
    }))
    vi.doMock("@/lib/editor/imageState", () => ({
      validateIncomingImageStateUpsert: vi.fn(() => ({
        role: "master",
        image_id: ACTIVE_IMAGE_UUID,
        x_px_u: "0",
        y_px_u: "0",
        width_px_u: "1000000",
        height_px_u: "1000000",
        rotation_deg: 0,
      })),
    }))
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => makeImageStateSupabaseLocked(),
    }))

    const mod = await import("@/app/api/projects/[projectId]/image-state/route")
    const req = new Request("http://test.local", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    })
    const res = await mod.POST(req, { params: Promise.resolve({ projectId: VALID_UUID }) })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.stage).toBe("lock_conflict")
    expect(body.reason).toBe("image_locked")
    expect(upsertBoundImageStateMock).not.toHaveBeenCalled()
  })

  it("image-state route returns active_image_mismatch when body image_id is stale", async () => {
    vi.resetModules()
    getActiveMasterImageIdMock.mockReset()
    upsertBoundImageStateMock.mockReset()
    getActiveMasterImageIdMock.mockResolvedValue({ imageId: ACTIVE_IMAGE_UUID, error: null })

    vi.doMock("@/lib/supabase/project-images", () => ({
      getActiveMasterImageId: (...args: unknown[]) => getActiveMasterImageIdMock(...args),
    }))
    vi.doMock("@/lib/supabase/image-state", () => ({
      loadBoundImageState: vi.fn(),
      upsertBoundImageState: (...args: unknown[]) => upsertBoundImageStateMock(...args),
    }))
    vi.doMock("@/lib/editor/imageState", () => ({
      validateIncomingImageStateUpsert: vi.fn(() => ({
        role: "master",
        image_id: STALE_IMAGE_UUID,
        x_px_u: "0",
        y_px_u: "0",
        width_px_u: "1000000",
        height_px_u: "1000000",
        rotation_deg: 0,
      })),
    }))
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => makeImageStateSupabaseLocked(),
    }))

    const mod = await import("@/app/api/projects/[projectId]/image-state/route")
    const req = new Request("http://test.local", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    })
    const res = await mod.POST(req, { params: Promise.resolve({ projectId: VALID_UUID }) })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.stage).toBe("active_image_mismatch")
    expect(upsertBoundImageStateMock).not.toHaveBeenCalled()
  })

  it("master image delete route returns active_conflict for non-active targets", async () => {
    vi.resetModules()
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => makeDeleteRouteSupabaseInactive(),
    }))

    const mod = await import("@/app/api/projects/[projectId]/images/master/[imageId]/route")
    const req = new Request("http://test.local", { method: "DELETE" })
    const res = await mod.DELETE(req, { params: Promise.resolve({ projectId: VALID_UUID, imageId: IMAGE_UUID }) })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.stage).toBe("active_conflict")
    expect(body.reason).toBe("image_not_active")
  })
})
