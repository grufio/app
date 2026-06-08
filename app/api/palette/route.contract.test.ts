import { describe, expect, it, vi } from "vitest"

import type { PaletteChip } from "@/lib/supabase/palette"

/**
 * Contract test for GET /api/palette.
 *
 * The route is a thin auth-gated wrapper over `readTracePalette` (the shared
 * DB accessor, unit-tested elsewhere). We mock the accessor + auth so these
 * assertions stay on the route's own contract: auth gate, both palettes in
 * the body, and the error → 500 path.
 */
async function importRouteWithMocks(args: {
  authed: boolean
  color?: PaletteChip[]
  bw?: PaletteChip[]
  throws?: Error
}) {
  vi.resetModules()

  vi.doMock("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () => ({}),
  }))

  vi.doMock("@/lib/api/route-guards", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api/route-guards")>("@/lib/api/route-guards")
    return {
      ...actual,
      requireUser: async () =>
        args.authed
          ? { ok: true, res: null }
          : { ok: false, res: actual.jsonError("Unauthorized", 401, { stage: "auth" }) },
    }
  })

  vi.doMock("@/lib/supabase/palette", () => ({
    readTracePalette: async (_supabase: unknown, mode: "color" | "bw") => {
      if (args.throws) throw args.throws
      return mode === "bw" ? (args.bw ?? []) : (args.color ?? [])
    },
  }))

  return import("./route")
}

const colorChip: PaletteChip = {
  oklab: [0.5, 0.1, -0.1],
  rgb: [128, 64, 64],
  notation: "5R 4/14",
  color_name: "Vivid red",
}
const bwChip: PaletteChip = {
  oklab: [0.3, 0, 0],
  rgb: [77, 77, 77],
  notation: "N 3.0/",
  color_name: "Dark gray",
}

describe("palette route contract", () => {
  it("GET returns both palettes under ok:true for an authed user", async () => {
    const mod = await importRouteWithMocks({ authed: true, color: [colorChip], bw: [bwChip] })
    const res = await mod.GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, color: [colorChip], bw: [bwChip] })
  })

  it("GET is auth-gated (401 when no user)", async () => {
    const mod = await importRouteWithMocks({ authed: false })
    const res = await mod.GET()
    expect(res.status).toBe(401)
  })

  it("GET returns 500 with stage palette_read when the accessor throws", async () => {
    const mod = await importRouteWithMocks({ authed: true, throws: new Error("Palette lab_munsell is empty") })
    const res = await mod.GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.stage).toBe("palette_read")
    expect(body.error).toContain("empty")
  })
})
