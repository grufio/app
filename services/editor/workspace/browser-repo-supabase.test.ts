import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { updateWorkspaceDpi, updateWorkspaceGeometry } from "./browser-repo-supabase"

function makeSupabaseSpy() {
  const update = vi.fn(() => {
    throw new Error("update() should not be called for invalid payloads")
  })

  const from = vi.fn(() => ({
    update,
    eq: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({ data: null, error: null })),
      })),
    })),
  }))

  return { supabase: { from } as unknown as SupabaseClient, from, update }
}

describe("workspace browser repo guards", () => {
  it("updateWorkspaceDpi rejects geometry fields in payload", async () => {
    const { supabase, update } = makeSupabaseSpy()

    const res = await updateWorkspaceDpi(supabase, {
      projectId: "p",
      outputDpi: 300,
      rasterEffectsPreset: "high",
      widthPxU: "123", // forbidden
    } as unknown as Parameters<typeof updateWorkspaceDpi>[1])

    expect(res.row).toBe(null)
    expect(res.error).toContain("invalid_payload_for_dpi_update")
    expect(update).not.toHaveBeenCalled()
  })

  it("updateWorkspaceGeometry rejects dpi/output fields in payload", async () => {
    const { supabase, update } = makeSupabaseSpy()

    const res = await updateWorkspaceGeometry(supabase, {
      projectId: "p",
      unit: "mm",
      widthValue: 200,
      heightValue: 100,
      widthPxU: "200000000",
      heightPxU: "100000000",
      widthPx: 200,
      heightPx: 100,
      outputDpi: 300, // forbidden
    } as unknown as Parameters<typeof updateWorkspaceGeometry>[1])

    expect(res.row).toBe(null)
    expect(res.error).toContain("invalid_payload_for_geometry_update")
    expect(update).not.toHaveBeenCalled()
  })
})

