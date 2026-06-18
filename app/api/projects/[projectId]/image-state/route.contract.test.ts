import { describe, expect, it, vi } from "vitest"

const VALID_UUID = "c104be01-d7b0-4af4-a446-8326cd47a282"
const ANCHOR_UUID = "2f5d1b28-0d9c-4d04-b2c5-8f1f3f7df5b0"

function makeSupabaseStub(opts: {
  projectAccessible: boolean
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
      throw new Error(`unexpected table: ${table}`)
    },
  } as unknown
}

type CapturedUpsert = { value: Record<string, unknown> | null }

type AnchorResolution =
  | { id: string }
  | { error: string }
  | { notFound: true }

async function importRouteWithMocks(args: {
  supabase: unknown
  /** Resolved state anchor (working_copy.id post-refactor), or notFound when no master/working_copy. */
  anchor: AnchorResolution
  loadState?: { row: Record<string, unknown> | null; error: string | null; unsupported?: boolean }
  upsertOk?: boolean
  /** When provided, captures the row passed to `upsertBoundImageState`. */
  captureUpsert?: CapturedUpsert
}) {
  vi.resetModules()

  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () => args.supabase,
  }))

  vi.doMock("@/lib/api/route-guards", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api/route-guards")>("@/lib/api/route-guards")
    return {
      ...actual,
      requireUser: async () => ({ ok: true, res: null }),
    }
  })

  vi.doMock("@/lib/supabase/image-state", () => ({
    resolveStateAnchorImage: async () => args.anchor,
    loadBoundImageState: async () => ({
      row: args.loadState?.row ?? null,
      error: args.loadState?.error ?? null,
      unsupported: args.loadState?.unsupported ?? false,
    }),
    upsertBoundImageState: async (_supabase: unknown, row: Record<string, unknown>) => {
      if (args.captureUpsert) args.captureUpsert.value = row
      return { ok: Boolean(args.upsertOk ?? true), error: args.upsertOk === false ? "upsert failed" : null }
    },
  }))

  return import("./route")
}

describe("image-state route contract", () => {
  it("GET returns exists:false when the project has no anchor image", async () => {
    const supabase = makeSupabaseStub({ projectAccessible: true })
    const mod = await importRouteWithMocks({ supabase, anchor: { notFound: true } })

    const res = await mod.GET(new Request("http://test.local"), { params: Promise.resolve({ projectId: VALID_UUID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ exists: false, state: null })
  })

  it("POST rejects payload missing required transform fields", async () => {
    const supabase = makeSupabaseStub({ projectAccessible: true })
    const mod = await importRouteWithMocks({ supabase, anchor: { id: ANCHOR_UUID } })

    const res = await mod.POST(
      new Request("http://test.local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          // width_px_u / height_px_u missing
          rotation_deg: 0,
        }),
      }),
      { params: Promise.resolve({ projectId: VALID_UUID }) }
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.stage).toBe("validation")
  })

  it("POST returns no_master_image when the project has no anchor image", async () => {
    const supabase = makeSupabaseStub({ projectAccessible: true })
    const mod = await importRouteWithMocks({ supabase, anchor: { notFound: true } })

    const res = await mod.POST(
      new Request("http://test.local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
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
    expect(body.stage).toBe("no_master_image")
  })

  it("POST anchors the upsert at the resolved anchor (= working_copy.id)", async () => {
    const supabase = makeSupabaseStub({ projectAccessible: true })
    const captured: CapturedUpsert = { value: null }
    const mod = await importRouteWithMocks({
      supabase,
      anchor: { id: ANCHOR_UUID },
      upsertOk: true,
      captureUpsert: captured,
    })

    const res = await mod.POST(
      new Request("http://test.local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          x_px_u: "555555",
          y_px_u: "666666",
          width_px_u: "1000000",
          height_px_u: "1000000",
          rotation_deg: 0,
        }),
      }),
      { params: Promise.resolve({ projectId: VALID_UUID }) }
    )

    expect(res.status).toBe(200)
    expect(captured.value?.image_id).toBe(ANCHOR_UUID)
    expect(captured.value?.x_px_u).toBe("555555")
    expect(captured.value?.y_px_u).toBe("666666")
  })

  it("POST with partial payload (x omitted) reads existing row and preserves x in upsert", async () => {
    const supabase = makeSupabaseStub({ projectAccessible: true })
    const captured: CapturedUpsert = { value: null }
    const mod = await importRouteWithMocks({
      supabase,
      anchor: { id: ANCHOR_UUID },
      upsertOk: true,
      loadState: {
        row: {
          image_id: ANCHOR_UUID,
          x_px_u: "111111",
          y_px_u: "222222",
          width_px_u: "1000000",
          height_px_u: "1000000",
          rotation_deg: 0,
        },
        error: null,
      },
      captureUpsert: captured,
    })

    const res = await mod.POST(
      new Request("http://test.local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          // x_px_u omitted — should be preserved from existing row.
          y_px_u: "999999",
          width_px_u: "1000000",
          height_px_u: "1000000",
          rotation_deg: 0,
        }),
      }),
      { params: Promise.resolve({ projectId: VALID_UUID }) }
    )

    expect(res.status).toBe(200)
    expect(captured.value).not.toBeNull()
    expect(captured.value?.x_px_u).toBe("111111") // preserved
    expect(captured.value?.y_px_u).toBe("999999") // updated
  })

  it("POST with full payload skips the read-merge (no existing-row dependency)", async () => {
    const supabase = makeSupabaseStub({ projectAccessible: true })
    const captured: CapturedUpsert = { value: null }
    const mod = await importRouteWithMocks({
      supabase,
      anchor: { id: ANCHOR_UUID },
      upsertOk: true,
      // loadState NOT provided — should not be needed.
      captureUpsert: captured,
    })

    const res = await mod.POST(
      new Request("http://test.local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          x_px_u: "555555",
          y_px_u: "666666",
          width_px_u: "1000000",
          height_px_u: "1000000",
          rotation_deg: 0,
        }),
      }),
      { params: Promise.resolve({ projectId: VALID_UUID }) }
    )

    expect(res.status).toBe(200)
    expect(captured.value?.x_px_u).toBe("555555")
    expect(captured.value?.y_px_u).toBe("666666")
  })

  it("POST returns ok:true on success", async () => {
    const supabase = makeSupabaseStub({ projectAccessible: true })
    const mod = await importRouteWithMocks({
      supabase,
      anchor: { id: ANCHOR_UUID },
      upsertOk: true,
    })

    const res = await mod.POST(
      new Request("http://test.local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
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
