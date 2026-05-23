import { beforeEach, describe, expect, it, vi } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import type { PixelateFilterSuccess } from "./pixelate"

// Mock the pixelate handler so applyProjectTrace runs without the
// Python filter service. The handler just needs to report success +
// the new output/base ids + the resolved display rect; the
// orchestrator's activation + geometry-persistence is what these
// tests pin. `vi.fn` so individual tests can override the return.
// Typed via the real PixelateFilterSuccess so xPxU/yPxU keep their
// `bigint | null` shape (the fresh-upload null-origin case).
const pixelateMock = vi.fn(
  async (): Promise<PixelateFilterSuccess> => ({
    ok: true,
    id: "trace-output-id",
    storagePath: "projects/p/images/trace-output-id",
    widthPx: 100,
    heightPx: 100,
    baseId: "trace-base-id",
    baseStoragePath: "projects/p/images/trace-base-id",
    displayRectPxU: {
      xPxU: 12_345_678n,
      yPxU: 98_765_432n,
      widthPxU: 566_929_134n,
      heightPxU: 283_464_567n,
    },
  }),
)

vi.mock("./pixelate", () => ({
  pixelateImageAndActivate: (...args: unknown[]) => pixelateMock(...(args as [])),
}))

import { applyProjectTrace } from "./index"

const PROJECT_ID = "project-id"
const WORKING_COPY_ID = "working-copy-id"

describe("applyProjectTrace — active surface invariant", () => {
  let activatedImageId: string | null

  beforeEach(() => {
    activatedImageId = null
    pixelateMock.mockClear()
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
              display_x_px_u: "12345678",
              display_y_px_u: "98765432",
              display_width_px_u: "566929134",
              display_height_px_u: "283464567",
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

describe("applyProjectTrace — per-trace display rect persistence (Invariant 2)", () => {
  beforeEach(() => {
    pixelateMock.mockClear()
  })

  /** Builds a mock that captures the row written to
   * project_image_trace.upsert and echoes a stored row back. */
  function makeTraceMock(args: {
    captured: { row?: Record<string, unknown> }
    storedRect: {
      display_x_px_u: string
      display_y_px_u: string
      display_width_px_u: string
      display_height_px_u: string
    }
  }) {
    return makeMockSupabase({
      tables: {
        project_images: {
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
          select: { data: null },
          upsert: {
            onCall: (c) => {
              args.captured.row = c.opArgs[0] as Record<string, unknown>
            },
            data: {
              project_id: PROJECT_ID,
              kind: "pixelate",
              params: {},
              output_image_id: "trace-output-id",
              base_image_id: "trace-base-id",
              ...args.storedRect,
              created_at: "2026-05-22T00:00:00Z",
              updated_at: "2026-05-22T00:00:00Z",
            },
          },
        },
      },
      rpcs: { set_active_image: { data: null } },
    })
  }

  it("writes the handler-resolved display rect onto the upsert and returns it", async () => {
    const captured: { row?: Record<string, unknown> } = {}
    const supabase = makeTraceMock({
      captured,
      storedRect: {
        display_x_px_u: "12345678",
        display_y_px_u: "98765432",
        display_width_px_u: "566929134",
        display_height_px_u: "283464567",
      },
    })

    const result = await applyProjectTrace({
      supabase,
      projectId: PROJECT_ID,
      kind: "pixelate",
      params: {
        supercell_width_mm: 6,
        supercell_height_mm: 6,
        num_colors: 16,
        source_image_id: WORKING_COPY_ID,
      },
    })

    expect(result.ok).toBe(true)

    // The geometry the handler resolved from project_image_state is
    // frozen onto the trace row (text-encoded µpx, stringified bigints).
    expect(captured.row).toMatchObject({
      display_x_px_u: "12345678",
      display_y_px_u: "98765432",
      display_width_px_u: "566929134",
      display_height_px_u: "283464567",
    })

    // And it travels back out on the returned trace row (GET/POST shape).
    if (result.ok) {
      expect(result.trace).toMatchObject({
        display_x_px_u: "12345678",
        display_y_px_u: "98765432",
        display_width_px_u: "566929134",
        display_height_px_u: "283464567",
      })
    }
  })

  it("maps a null origin (fresh-upload, no persisted x/y) to the '0' signal", async () => {
    // The fresh-upload fallback in resolveMasterState leaves x/y null
    // (no persisted origin → centre at 0n). Persistence must encode that
    // as "0", never as the string "null" or a NOT NULL violation.
    pixelateMock.mockResolvedValueOnce({
      ok: true,
      id: "trace-output-id",
      storagePath: "projects/p/images/trace-output-id",
      widthPx: 100,
      heightPx: 100,
      baseId: "trace-base-id",
      baseStoragePath: "projects/p/images/trace-base-id",
      displayRectPxU: {
        xPxU: null,
        yPxU: null,
        widthPxU: 566_929_134n,
        heightPxU: 283_464_567n,
      },
    })

    const captured: { row?: Record<string, unknown> } = {}
    const supabase = makeTraceMock({
      captured,
      storedRect: {
        display_x_px_u: "0",
        display_y_px_u: "0",
        display_width_px_u: "566929134",
        display_height_px_u: "283464567",
      },
    })

    const result = await applyProjectTrace({
      supabase,
      projectId: PROJECT_ID,
      kind: "pixelate",
      params: {
        supercell_width_mm: 6,
        supercell_height_mm: 6,
        num_colors: 16,
        source_image_id: WORKING_COPY_ID,
      },
    })

    expect(result.ok).toBe(true)
    expect(captured.row).toMatchObject({
      display_x_px_u: "0",
      display_y_px_u: "0",
      display_width_px_u: "566929134",
      display_height_px_u: "283464567",
    })
  })
})
