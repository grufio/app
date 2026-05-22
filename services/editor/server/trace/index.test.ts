import { beforeEach, describe, expect, it, vi } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"

// Mock the pixelate handler so applyProjectTrace runs without the
// Python filter service. The handler just needs to report success +
// the new output/base ids; the orchestrator's activation choice is
// what this test pins.
vi.mock("./pixelate", () => ({
  pixelateImageAndActivate: vi.fn(async () => ({
    ok: true as const,
    id: "trace-output-id",
    storagePath: "projects/p/images/trace-output-id",
    widthPx: 100,
    heightPx: 100,
    baseId: "trace-base-id",
    baseStoragePath: "projects/p/images/trace-base-id",
  })),
}))

import { applyProjectTrace } from "./index"

const PROJECT_ID = "project-id"
const WORKING_COPY_ID = "working-copy-id"

describe("applyProjectTrace — active surface invariant", () => {
  let activatedImageId: string | null

  beforeEach(() => {
    activatedImageId = null
  })

  // Regression guard: the long-standing pixelate bug was that applying
  // a trace activated `trace_output` (is_active=true). The master-image
  // route returns the active image as the editor's "primary image", and
  // `refreshMasterImage()` after apply then flipped `masterImageId`,
  // which reset the persisted display transform + canvas mirror and
  // snapped the canvas back to the original image's intrinsic
  // aspect/size. The trace is an OVERLAY — applying it must keep the
  // editing surface (the source we traced from) active so the user's
  // resize survives.
  it("activates the source surface (working_copy), not the trace output", async () => {
    const supabase = makeMockSupabase({
      tables: {
        project_images: {
          // resolveSourceById (no is_active filter) → unlocked source.
          // getActiveProjectImageLockRow (is_active filter) → the
          // currently-active working_copy, unlocked.
          select: (ctx) => {
            const filtersOnIsActive = ctx.args.some(
              (a) => Array.isArray(a) && a[0] === "is_active",
            )
            if (filtersOnIsActive) {
              return { data: { id: WORKING_COPY_ID, is_locked: false } }
            }
            return { data: { is_locked: false } }
          },
        },
        project_image_trace: {
          select: { data: null }, // no prior trace row
          upsert: {
            data: {
              project_id: PROJECT_ID,
              kind: "pixelate",
              params: { supercell_width_mm: 6, supercell_height_mm: 6, num_colors: 16 },
              output_image_id: "trace-output-id",
              base_image_id: "trace-base-id",
              created_at: "2026-05-22T00:00:00Z",
              updated_at: "2026-05-22T00:00:00Z",
            },
          },
        },
      },
      rpcs: {
        set_active_image: {
          onCall: (c) => {
            const rpcArgs = c.opArgs[1] as { p_image_id?: string } | undefined
            activatedImageId = rpcArgs?.p_image_id ?? null
          },
          data: null,
        },
      },
    })

    const result = await applyProjectTrace({
      supabase,
      projectId: PROJECT_ID,
      kind: "pixelate",
      // `source_image_id` selects the simple source-resolution branch;
      // the schema strips it, the orchestrator reads it from rawParams.
      params: {
        supercell_width_mm: 6,
        supercell_height_mm: 6,
        num_colors: 16,
        source_image_id: WORKING_COPY_ID,
      },
    })

    expect(result.ok).toBe(true)
    // The activation must target the source surface, never the SVG output.
    expect(activatedImageId).toBe(WORKING_COPY_ID)
    expect(activatedImageId).not.toBe("trace-output-id")
  })
})
