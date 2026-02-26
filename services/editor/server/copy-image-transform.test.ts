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
})
