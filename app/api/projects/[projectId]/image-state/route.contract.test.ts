import { describe, expect, it, vi } from "vitest"

const VALID_UUID = "c104be01-d7b0-4af4-a446-8326cd47a282"
const OTHER_UUID = "2f5d1b28-0d9c-4d04-b2c5-8f1f3f7df5b0"

function makeSupabaseStub(opts: {
  projectAccessible: boolean
  activeImageLocked: boolean
}) {
  return {
    from: (table: string) => {
      if (table === "projects") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.projectAccessible ? { id: VALID_UUID } : null,
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
                is: () => ({
                  maybeSingle: async () => ({
                    data: { is_locked: opts.activeImageLocked },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }
      }

      throw new Error(`unexpected table: ${table}`)
    },
  } as any
}

async function importRouteWithMocks(args: {
  supabase: any
  activeImageId: string | null
  loadState?: { row: any | null; error: string | null; unsupported?: boolean }
  upsertOk?: boolean
}) {
  vi.resetModules()

  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () => args.supabase,
  }))

  vi.doMock("@/lib/api/route-guards", async () => {
    const actual = await vi.importActual<any>("@/lib/api/route-guards")
    return {
      ...actual,
      requireUser: async () => ({ ok: true, res: null }),
    }
  })

  vi.doMock("@/lib/supabase/project-images", () => ({
    getActiveMasterImageId: async () => ({ imageId: args.activeImageId, error: null }),
  }))

  vi.doMock("@/lib/supabase/image-state", () => ({
    loadBoundImageState: async () => ({
      row: args.loadState?.row ?? null,
      error: args.loadState?.error ?? null,
      unsupported: args.loadState?.unsupported ?? false,
    }),
    upsertBoundImageState: async () => ({ ok: Boolean(args.upsertOk ?? true), error: args.upsertOk === false ? "upsert failed" : null }),
  }))

  return import("./route")
}

describe("image-state route contract", () => {
  it("GET returns exists:false when no active image", async () => {
    const supabase = makeSupabaseStub({ projectAccessible: true, activeImageLocked: false })
    const mod = await importRouteWithMocks({ supabase, activeImageId: null })

    const res = await mod.GET(new Request("http://test.local"), { params: Promise.resolve({ projectId: VALID_UUID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ exists: false, state: null })
  })

  it("POST rejects invalid image_id", async () => {
    const supabase = makeSupabaseStub({ projectAccessible: true, activeImageLocked: false })
    const mod = await importRouteWithMocks({ supabase, activeImageId: VALID_UUID })

    const res = await mod.POST(
      new Request("http://test.local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image_id: "nope",
          role: "master",
          x_px_u: "0",
          y_px_u: "0",
          width_px_u: "1000000",
          height_px_u: "1000000",
          rotation_deg: 0,
        }),
      }),
      { params: Promise.resolve({ projectId: VALID_UUID }) }
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.stage).toBe("validation")
    expect(body.where).toBe("image_id")
  })

  it("POST enforces active image binding (409 active_image_mismatch)", async () => {
    const supabase = makeSupabaseStub({ projectAccessible: true, activeImageLocked: false })
    const mod = await importRouteWithMocks({ supabase, activeImageId: VALID_UUID })

    const res = await mod.POST(
      new Request("http://test.local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image_id: OTHER_UUID,
          role: "master",
          x_px_u: "0",
          y_px_u: "0",
          width_px_u: "1000000",
          height_px_u: "1000000",
          rotation_deg: 0,
        }),
      }),
      { params: Promise.resolve({ projectId: VALID_UUID }) }
    )

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.stage).toBe("active_image_mismatch")
    expect(body.expected_image_id).toBe(VALID_UUID)
  })

  it("POST blocks writes when active image is locked (409 lock_conflict)", async () => {
    const supabase = makeSupabaseStub({ projectAccessible: true, activeImageLocked: true })
    const mod = await importRouteWithMocks({ supabase, activeImageId: VALID_UUID })

    const res = await mod.POST(
      new Request("http://test.local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image_id: VALID_UUID,
          role: "master",
          x_px_u: "0",
          y_px_u: "0",
          width_px_u: "1000000",
          height_px_u: "1000000",
          rotation_deg: 0,
        }),
      }),
      { params: Promise.resolve({ projectId: VALID_UUID }) }
    )

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.stage).toBe("lock_conflict")
  })

  it("POST returns ok:true on success", async () => {
    const supabase = makeSupabaseStub({ projectAccessible: true, activeImageLocked: false })
    const mod = await importRouteWithMocks({ supabase, activeImageId: VALID_UUID, upsertOk: true })

    const res = await mod.POST(
      new Request("http://test.local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image_id: VALID_UUID,
          role: "master",
          x_px_u: "0",
          y_px_u: "0",
          width_px_u: "1000000",
          height_px_u: "1000000",
          rotation_deg: 0,
        }),
      }),
      { params: Promise.resolve({ projectId: VALID_UUID }) }
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })
})

