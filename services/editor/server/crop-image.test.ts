import { describe, expect, it, vi } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { cropImageAndActivate } from "./crop-image"

vi.mock("@/lib/supabase/service-role", () => ({
  createSupabaseServiceRoleClient: () => ({
    storage: {
      from: () => ({
        download: vi.fn(),
        upload: vi.fn(),
        remove: vi.fn(),
      }),
    },
  }),
}))

vi.mock("@/services/editor/server/activate-project-image", () => ({
  activateProjectImageOnly: vi.fn(),
}))

function makeSupabase(sourceRow: Record<string, unknown> | null) {
  return makeMockSupabase({
    tables: {
      project_images: {
        select: { data: sourceRow, error: null },
        insert: { data: null, error: null },
        delete: { data: null, error: null },
      },
    },
  })
}

describe("crop-image lock and missing guards", () => {
  it("returns source_lookup when source image does not exist", async () => {
    const supabase = makeSupabase(null)
    const out = await cropImageAndActivate({
      supabase: supabase as never,
      projectId: "proj-1",
      sourceImageId: "img-1",
      rect: { x: 0, y: 0, w: 10, h: 10 },
    })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.stage).toBe("source_lookup")
      expect(out.status).toBe(404)
    }
  })

})
