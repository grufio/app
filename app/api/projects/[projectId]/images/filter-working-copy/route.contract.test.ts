import { describe, expect, it, vi } from "vitest"

const VALID_UUID = "c104be01-d7b0-4af4-a446-8326cd47a282"

type DisplayPayload = { id: string; storagePath: string; widthPx: number; heightPx: number; signedUrl: string; sourceImageId: string | null; name: string; isFilterResult: boolean }

async function importRouteWithMocks(args: {
  serviceResult:
    | { ok: true; display: DisplayPayload; displayWithoutTrace: DisplayPayload; stack: Array<{ id: string; name: string; filterType: "bw_hard" | "bw_soft" | "bw_warm" | "unknown"; source_image_id: string | null }> }
    | { ok: false; status: number; stage: string; reason: string; code?: string }
}) {
  vi.resetModules()

  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () => ({
      from: (table: string) => {
        if (table !== "projects") throw new Error(`unexpected table: ${table}`)
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: VALID_UUID }, error: null }),
            }),
          }),
        }
      },
    }),
  }))

  vi.doMock("@/lib/api/route-guards", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api/route-guards")>("@/lib/api/route-guards")
    return {
      ...actual,
      requireUser: async () => ({ ok: true, res: null }),
    }
  })

  vi.doMock("@/services/editor/server/filter-working-copy", () => ({
    getFilterPanelData: async () => args.serviceResult,
  }))

  return import("./route")
}

describe("filter-working-copy route contract", () => {
  it("returns exists:false only for no_active_image", async () => {
    const mod = await importRouteWithMocks({
      serviceResult: {
        ok: false,
        status: 404,
        stage: "no_active_image",
        reason: "Active image not found",
      },
    })

    const res = await mod.POST(new Request("http://test.local", { method: "POST" }), {
      params: Promise.resolve({ projectId: VALID_UUID }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, exists: false, stage: "no_active_image" })
  })

  it("returns non-2xx stage contract for technical failures", async () => {
    const mod = await importRouteWithMocks({
      serviceResult: {
        ok: false,
        status: 400,
        stage: "active_lookup",
        reason: "lookup failed",
        code: "PGRST116",
      },
    })

    const res = await mod.POST(new Request("http://test.local", { method: "POST" }), {
      params: Promise.resolve({ projectId: VALID_UUID }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.stage).toBe("active_lookup")
    expect(body.code).toBe("PGRST116")
  })

  it("propagates transform_sync failures without downgrading to exists:false", async () => {
    const mod = await importRouteWithMocks({
      serviceResult: {
        ok: false,
        status: 500,
        stage: "transform_sync",
        reason: "Source image transform is missing",
      },
    })

    const res = await mod.POST(new Request("http://test.local", { method: "POST" }), {
      params: Promise.resolve({ projectId: VALID_UUID }),
    })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.stage).toBe("transform_sync")
    expect(body.error).toBe("Source image transform is missing")
  })

  it("maps success payload", async () => {
    const display = {
      id: "img-1",
      storagePath: "projects/p/images/1",
      widthPx: 100,
      heightPx: 200,
      signedUrl: "https://signed.example",
      sourceImageId: null,
      name: "base",
      isFilterResult: false,
    }
    const mod = await importRouteWithMocks({
      serviceResult: {
        ok: true,
        display,
        displayWithoutTrace: display,
        stack: [],
      },
    })

    const res = await mod.POST(new Request("http://test.local", { method: "POST" }), {
      params: Promise.resolve({ projectId: VALID_UUID }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.exists).toBe(true)
    expect(body.id).toBe("img-1")
    expect(body.signed_url).toBe("https://signed.example")
    expect(body.without_trace?.signed_url).toBe("https://signed.example")
  })

  it("propagates a distinct displayWithoutTrace alongside the trace-aware display", async () => {
    const traceDisplay = {
      id: "trace-1",
      storagePath: "projects/p/images/trace-1",
      widthPx: 500,
      heightPx: 500,
      signedUrl: "https://signed.example/trace.svg",
      sourceImageId: "filter-tip-id",
      name: "trace",
      isFilterResult: true,
    }
    const filterTip = {
      id: "filter-tip-id",
      storagePath: "projects/p/images/filter-tip",
      widthPx: 500,
      heightPx: 500,
      signedUrl: "https://signed.example/filter-tip.png",
      sourceImageId: null,
      name: "filter-tip",
      isFilterResult: true,
    }
    const mod = await importRouteWithMocks({
      serviceResult: {
        ok: true,
        display: traceDisplay,
        displayWithoutTrace: filterTip,
        stack: [],
      },
    })

    const res = await mod.POST(new Request("http://test.local", { method: "POST" }), {
      params: Promise.resolve({ projectId: VALID_UUID }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    // Default display is trace-aware
    expect(body.id).toBe("trace-1")
    expect(body.signed_url).toBe("https://signed.example/trace.svg")
    // Without-trace variant carries the filter tip
    expect(body.without_trace.id).toBe("filter-tip-id")
    expect(body.without_trace.signed_url).toBe("https://signed.example/filter-tip.png")
  })
})

