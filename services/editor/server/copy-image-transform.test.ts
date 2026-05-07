import { describe, expect, it } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { copyImageTransform } from "@/services/editor/server/copy-image-transform"

describe("copyImageTransform", () => {
  it("fails deterministically when source transform is missing", async () => {
    const supabase = makeMockSupabase({
      tables: {
        project_image_state: { select: { data: null, error: null } },
      },
    })

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
    const upsertCalls: unknown[][] = []
    const supabase = makeMockSupabase({
      tables: {
        project_image_state: {
          select: { data: null, error: null },
          upsert: {
            data: null,
            error: null,
            onCall: ({ opArgs }) => upsertCalls.push(opArgs),
          },
        },
      },
    })

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
    expect(upsertCalls).toHaveLength(1)
    // upsertCalls[0] is the args array of the *upsert call itself*; the
    // first slot is the row, the second is options.
    const [row, opts] = upsertCalls[0] as [Record<string, unknown>, Record<string, unknown>]
    expect(row).toMatchObject({
      image_id: "target-1",
      x_px_u: "0",
      y_px_u: "0",
      width_px_u: "640000000",
      height_px_u: "480000000",
      rotation_deg: 0,
    })
    expect(opts).toEqual({ onConflict: "project_id,image_id" })
  })
})
