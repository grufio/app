import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

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

vi.mock("@/lib/supabase/project-images", () => ({
  activateMasterWithState: vi.fn(),
}))

function makeSupabase(sourceRow: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => ({ data: sourceRow, error: null }),
            }),
          }),
        }),
      }),
      insert: async () => ({ error: null }),
      delete: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  } as unknown as SupabaseClient
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

  it("returns lock_conflict when source image is locked", async () => {
    const supabase = makeSupabase({
      id: "img-1",
      project_id: "proj-1",
      name: "src",
      format: "png",
      width_px: 100,
      height_px: 100,
      storage_bucket: "project_images",
      storage_path: "projects/proj-1/images/img-1",
      deleted_at: null,
      is_locked: true,
    })
    const out = await cropImageAndActivate({
      supabase: supabase as never,
      projectId: "proj-1",
      sourceImageId: "img-1",
      rect: { x: 0, y: 0, w: 10, h: 10 },
    })
    expect(out).toEqual({
      ok: false,
      status: 409,
      stage: "lock_conflict",
      reason: "Source image is locked",
      code: "image_locked",
    })
  })
})
