import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

// activateProjectImage and createSupabaseServiceRoleClient are only reached
// on the happy / tail-removal path; mock them so the unit tests don't need a
// real supabase + storage stack. The createDerivedImageFromSource path
// (rebuild-after-mid-stack-remove) is NOT covered here — it requires a fake
// filter-service HTTP server which is out of scope for a unit test.
vi.mock("@/services/editor/server/activate-project-image", () => ({
  activateProjectImage: vi.fn(async () => ({ ok: true as const, status: 200, stage: "active_switch" as const })),
}))
vi.mock("@/lib/supabase/service-role", () => ({
  createSupabaseServiceRoleClient: vi.fn(() => ({
    storage: {
      from: () => ({
        remove: vi.fn(async () => ({ data: null, error: null })),
      }),
    },
  })),
}))

import { removeProjectImageFilter } from "./filter-variants"

type StackRow = {
  id: string
  input_image_id: string
  output_image_id: string
  filter_type: string
  filter_params: Record<string, unknown>
  stack_order: number
  is_hidden: boolean
  created_at: string
}

function makeSupabase(args: {
  filters?: StackRow[]
  filtersError?: { message: string; code?: string } | null
  rpcError?: { message: string; code?: string } | null
  activeRow?: { width_px: number; height_px: number; dpi: number } | null
}): { supabase: SupabaseClient<Database>; rpcCalls: Array<{ fn: string; args: unknown }> } {
  const rpcCalls: Array<{ fn: string; args: unknown }> = []

  const from = vi.fn((table: string) => {
    if (table === "project_image_filters") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(async () => {
              if (args.filtersError) return { data: null, error: args.filtersError }
              return { data: args.filters ?? [], error: null }
            }),
          })),
        })),
      }
    }
    if (table === "project_images") {
      return {
        select: vi.fn(() => {
          // chain supports both `.eq().is().maybeSingle()` (active-row lookup)
          // and `.in().is()` (cleanup query that returns rows).
          const chain: Record<string, unknown> = {}
          chain.eq = vi.fn(() => chain)
          chain.is = vi.fn(() => Object.assign(Promise.resolve({ data: [], error: null }), chain))
          chain.in = vi.fn(() => chain)
          chain.maybeSingle = vi.fn(async () => {
            if (!args.activeRow) return { data: null, error: null }
            return { data: args.activeRow, error: null }
          })
          return chain
        }),
      }
    }
    return {}
  })

  const rpc = vi.fn(async (fn: string, rpcArgs: unknown) => {
    rpcCalls.push({ fn, args: rpcArgs })
    if (args.rpcError) return { data: null, error: args.rpcError }
    return { data: null, error: null }
  })

  return {
    supabase: { from, rpc } as unknown as SupabaseClient<Database>,
    rpcCalls,
  }
}

const PROJECT_ID = "00000000-0000-4000-8000-000000000001"

function row(id: string, stackOrder: number, input: string, output: string): StackRow {
  return {
    id,
    input_image_id: input,
    output_image_id: output,
    filter_type: "pixelate",
    filter_params: { superpixel_width: 10, superpixel_height: 10, num_colors: 16, color_mode: "rgb" },
    stack_order: stackOrder,
    is_hidden: false,
    created_at: "2026-05-06T00:00:00Z",
  }
}

describe("removeProjectImageFilter", () => {
  it("returns 404 filter_lookup when the id is not in the stack", async () => {
    const { supabase } = makeSupabase({ filters: [row("f1", 1, "img-a", "img-b")] })
    const result = await removeProjectImageFilter({ supabase, projectId: PROJECT_ID, filterId: "missing" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(404)
      expect(result.stage).toBe("filter_lookup")
    }
  })

  it("propagates the supabase select error as filter_lookup", async () => {
    const { supabase } = makeSupabase({
      filtersError: { message: "RLS denied", code: "42501" },
    })
    const result = await removeProjectImageFilter({ supabase, projectId: PROJECT_ID, filterId: "f1" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.stage).toBe("filter_lookup")
      expect(result.code).toBe("42501")
    }
  })

  it("calls remove_project_image_filter RPC with empty rewires when removing the tail", async () => {
    const filters = [
      row("f1", 1, "img-master", "img-1"),
      row("f2", 2, "img-1", "img-2"),
    ]
    const { supabase, rpcCalls } = makeSupabase({
      filters,
      activeRow: { width_px: 100, height_px: 100, dpi: 72 },
    })
    const result = await removeProjectImageFilter({ supabase, projectId: PROJECT_ID, filterId: "f2" })
    expect(result.ok).toBe(true)
    if (result.ok) {
      // After removing the tail, the active image is the input of the removed filter.
      expect(result.active_image_id).toBe("img-1")
    }
    const removeCall = rpcCalls.find((c) => c.fn === "remove_project_image_filter")
    expect(removeCall).toBeDefined()
    const rpcArgs = removeCall?.args as { p_project_id: string; p_filter_id: string; p_rewires: unknown[] }
    expect(rpcArgs.p_project_id).toBe(PROJECT_ID)
    expect(rpcArgs.p_filter_id).toBe("f2")
    expect(rpcArgs.p_rewires).toEqual([])
  })

  it("returns rebuild stage when the RPC fails on tail removal", async () => {
    const filters = [row("f1", 1, "img-master", "img-1")]
    const { supabase } = makeSupabase({
      filters,
      activeRow: { width_px: 100, height_px: 100, dpi: 72 },
      rpcError: { message: "advisory lock wait timeout", code: "55P03" },
    })
    const result = await removeProjectImageFilter({ supabase, projectId: PROJECT_ID, filterId: "f1" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("rebuild")
      expect(result.code).toBe("55P03")
    }
  })
})
