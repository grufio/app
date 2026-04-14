import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { copyImageTransform } from "@/services/editor/server/copy-image-transform"

describe("copyImageTransform", () => {
  it("fails deterministically when source transform is missing", async () => {
    const maybeSingle = vi.fn(async () => ({ data: null, error: null }))
    const eq2 = vi.fn(() => ({ maybeSingle }))
    const eq1 = vi.fn(() => ({ eq: eq2 }))
    const select = vi.fn(() => ({ eq: eq1 }))
    const from = vi.fn(() => ({ select }))

    const supabase = { from } as unknown as SupabaseClient<Database>

    const result = await copyImageTransform({
      supabase,
      projectId: "project-1",
      sourceImageId: "source-1",
      targetImageId: "target-1",
      sourceWidth: 1000,
      sourceHeight: 800,
      targetWidth: 1000,
      targetHeight: 800,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain("missing")
    }
  })

  it("writes deterministic fallback transform when enabled and source is missing", async () => {
    const maybeSingle = vi.fn(async () => ({ data: null, error: null }))
    const eq2 = vi.fn(() => ({ maybeSingle }))
    const eq1 = vi.fn(() => ({ eq: eq2 }))
    const select = vi.fn(() => ({ eq: eq1 }))
    const upsert = vi.fn(async () => ({ error: null }))
    const from = vi.fn((table: string) => (table === "project_image_state" ? { select, upsert } : { select }))

    const supabase = { from } as unknown as SupabaseClient<Database>

    const result = await copyImageTransform({
      supabase,
      projectId: "project-1",
      sourceImageId: "source-1",
      targetImageId: "target-1",
      sourceWidth: 1000,
      sourceHeight: 800,
      targetWidth: 640,
      targetHeight: 480,
      fallbackWhenMissingSource: true,
    })

    expect(result).toEqual({ ok: true })
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        image_id: "target-1",
        x_px_u: "0",
        y_px_u: "0",
        width_px_u: "640000000",
        height_px_u: "480000000",
        rotation_deg: 0,
      }),
      { onConflict: "project_id,image_id" }
    )
  })
})
