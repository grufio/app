import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import type { Database } from "@/lib/supabase/database.types"

// activateProjectImageOnly and createSupabaseServiceRoleClient are only
// reached on the happy / tail-removal path; mock them so the unit tests
// don't need a real supabase + storage stack. The createDerivedImageFromSource
// path (rebuild-after-mid-stack-remove) is NOT covered here — it requires a
// fake filter-service HTTP server which is out of scope for a unit test.
vi.mock("@/services/editor/server/activate-project-image", () => ({
  activateProjectImageOnly: vi.fn(async () => ({ ok: true as const, status: 200, stage: "active_switch" as const })),
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
  created_at: string
}

function makeSupabase(args: {
  filters?: StackRow[]
  filtersError?: { message: string; code?: string } | null
  rpcError?: { message: string; code?: string } | null
  activeRow?: { width_px: number; height_px: number; dpi: number } | null
}): { supabase: SupabaseClient<Database>; rpcCalls: Array<{ fn: string; args: unknown }> } {
  const rpcCalls: Array<{ fn: string; args: unknown }> = []

  const supabase = makeMockSupabase({
    tables: {
      project_image_filters: {
        select: args.filtersError
          ? { data: null, error: args.filtersError }
          : { data: args.filters ?? [], error: null },
      },
      project_images: {
        // The production code awaits one chain on this table for
        // active-row lookup (`.maybeSingle()`) and another for the
        // cleanup query (`.in().is()` resolves to an array). Branch
        // on the terminal so each gets its own shape.
        select: ({ ops }) => {
          if (ops.includes("maybeSingle")) {
            return { data: args.activeRow ?? null, error: null }
          }
          return { data: [], error: null }
        },
      },
    },
    rpcs: {
      remove_project_image_filter: {
        data: null,
        error: args.rpcError ?? null,
        onCall: ({ opArgs }) => {
          const [fn, rpcArgs] = opArgs as [string, unknown]
          rpcCalls.push({ fn, args: rpcArgs })
        },
      },
    },
  })

  return { supabase: supabase as SupabaseClient<Database>, rpcCalls }
}

const PROJECT_ID = "00000000-0000-4000-8000-000000000001"

function row(id: string, input: string, output: string): StackRow {
  return {
    id,
    input_image_id: input,
    output_image_id: output,
    filter_type: "bw_hard",
    filter_params: { superpixel_width: 10, superpixel_height: 10, num_colors: 16, color_mode: "rgb" },
    created_at: "2026-05-06T00:00:00Z",
  }
}

describe("removeProjectImageFilter", () => {
  it("returns 404 filter_lookup when the id is not in the stack", async () => {
    const { supabase } = makeSupabase({ filters: [row("f1", "img-a", "img-b")] })
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

  it("removes the single filter, activates its input, calls the RPC without rewires", async () => {
    // Single-artifact model: at most one filter; removing it falls straight back
    // to its input (the working_copy). No downstream chain / rewires.
    const filters = [row("f1", "img-working", "img-1")]
    const { supabase, rpcCalls } = makeSupabase({
      filters,
      activeRow: { width_px: 100, height_px: 100, dpi: 72 },
    })
    const result = await removeProjectImageFilter({ supabase, projectId: PROJECT_ID, filterId: "f1" })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.active_image_id).toBe("img-working")
    }
    const removeCall = rpcCalls.find((c) => c.fn === "remove_project_image_filter")
    expect(removeCall).toBeDefined()
    const rpcArgs = removeCall?.args as { p_project_id: string; p_filter_id: string }
    expect(rpcArgs.p_project_id).toBe(PROJECT_ID)
    expect(rpcArgs.p_filter_id).toBe("f1")
  })

  it("returns rebuild stage when the RPC fails on removal", async () => {
    const filters = [row("f1", "img-master", "img-1")]
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
