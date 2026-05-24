/**
 * @vitest-environment jsdom
 *
 * The display-size PIXEL corruption gate (arch_trace_layer_root).
 *
 * Measures, in ABSOLUTE µpx (no ratio/aspect), that a SYSTEM placement
 * reported up from the canvas does NOT overwrite the persisted display
 * size in the authoritative source (`use-display-size`). The user works
 * in pixels; this test asserts the exact pixel value survives.
 *
 * Prod shape (project 2d15eeeb…): source bitmap 1254×1254 px, persisted
 * display size 283.46×566.93 px (= 283464567 × 566929134 µpx). The
 * reported symptom is that the image renders at the source-bitmap
 * intrinsic (1254) instead of the persisted display size.
 *
 * Root cause this gate pins: the canvas report effect backed
 * `onImageTransformChange` and fired on EVERY `imageTx` change, including
 * system placements (the fresh-upload / re-placement intrinsic). That
 * leaked the intrinsic INTO `displayTxU`, the one source the image layer,
 * trace dialog and legacy trace-overlay all read. The fix gates the
 * report on `hasUserChanged()` so only real user edits feed the source.
 *
 * Why the existing `use-display-size.hook.test.tsx` did NOT catch it: it
 * calls `handleImageTransformChange` directly with explicit user values —
 * it never exercises the CANVAS report path that fires the system
 * intrinsic. This test wires the real report controller to the real
 * source so the corruption channel is in the loop.
 */
import { act, renderHook, waitFor } from "@testing-library/react"
import { useRef } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getImageState, saveImageState as saveImageStateApi } from "@/lib/api/image-state"
import { useDisplaySize, type ImageState } from "@/lib/editor/hooks/use-display-size"
import type { ProjectCanvasStageHandle } from "@/features/editor"
import { createStateSyncGuard } from "./state-sync-guard"
import { shouldReportImageTransform, useReportTransformOnUserEdit } from "./report-transform-controller"

vi.mock("@/lib/api/image-state", () => ({
  getImageState: vi.fn(),
  saveImageState: vi.fn(),
}))
vi.mock("@/lib/monitoring/with-error-reporting", () => ({
  reportClientError: vi.fn(),
}))

const getImageStateMock = vi.mocked(getImageState)
const saveImageStateApiMock = vi.mocked(saveImageStateApi)

// Persisted display size (prod 2d15eeeb…): 283.46 × 566.93 px in µpx.
const DISPLAY_W_PX_U = 283464567n
const DISPLAY_H_PX_U = 566929134n

// Source-bitmap intrinsic (master/working_copy): 1254 × 1254 px in µpx.
const INTRINSIC_PX_U = 1254n * 1_000_000n

const seed: ImageState = {
  xPxU: 297_500_000n,
  yPxU: 421_000_000n,
  widthPxU: DISPLAY_W_PX_U,
  heightPxU: DISPLAY_H_PX_U,
  rotationDeg: 0,
}

type Tx = { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint }

/**
 * Render the authoritative source plus the canvas report controller,
 * faithfully wired: the controller's `report` is the source's
 * `handleImageTransformChange`, exactly as `ProjectEditorStage` wires
 * `onImageTransformChange={handleImageTransformChange}`.
 */
function renderCanvasAndSource(initialImageTx: Tx) {
  const guardRef = { current: createStateSyncGuard() }
  const hook = renderHook(
    ({ imageTx }: { imageTx: Tx }) => {
      const canvasRef = useRef<ProjectCanvasStageHandle | null>({
        setImagePosition: vi.fn(),
      } as unknown as ProjectCanvasStageHandle)
      const source = useDisplaySize({
        projectId: "p1",
        masterImageId: "master-A",
        initial: seed,
        canvasRef,
      })
      useReportTransformOnUserEdit({
        imageTx,
        guardRef,
        report: source.handleImageTransformChange,
      })
      return source
    },
    { initialProps: { imageTx: initialImageTx } },
  )
  return { ...hook, guardRef }
}

describe("report-transform controller — system placement must not clobber displayTxU", () => {
  beforeEach(() => {
    getImageStateMock.mockReset()
    saveImageStateApiMock.mockReset()
  })

  it("predicate: a system placement (no user edit) is NOT reported", () => {
    const guard = createStateSyncGuard()
    expect(shouldReportImageTransform(guard)).toBe(false)
  })

  it("predicate: a user edit IS reported", () => {
    const guard = createStateSyncGuard()
    guard.markUserChanged()
    expect(shouldReportImageTransform(guard)).toBe(true)
  })

  it("holds the persisted display size when the canvas reports a SYSTEM intrinsic placement", () => {
    // Boot: the source is seeded at the persisted display size.
    const { result, rerender } = renderCanvasAndSource({
      xPxU: seed.xPxU!,
      yPxU: seed.yPxU!,
      widthPxU: DISPLAY_W_PX_U,
      heightPxU: DISPLAY_H_PX_U,
    })
    expect(result.current.displayTxU).toEqual({
      x: seed.xPxU,
      y: seed.yPxU,
      w: DISPLAY_W_PX_U,
      h: DISPLAY_H_PX_U,
    })

    // The canvas applies a SYSTEM intrinsic placement (no markUserChanged):
    // the placement controller's fresh-upload / re-placement intrinsic, or
    // a re-placement during an active-image reset. `imageTx` flips to the
    // source-bitmap 1254×1254 and the report effect fires.
    rerender({ imageTx: { xPxU: 0n, yPxU: 0n, widthPxU: INTRINSIC_PX_U, heightPxU: INTRINSIC_PX_U } })

    // The authoritative source MUST still be the persisted display size —
    // not the source-bitmap intrinsic. Pre-fix the unconditional report
    // overwrote it with 1254×1254.
    expect(
      result.current.displayTxU?.w,
      `displayTxU width must be the persisted ${DISPLAY_W_PX_U} µpx, not the intrinsic ${INTRINSIC_PX_U}`,
    ).toBe(DISPLAY_W_PX_U)
    expect(
      result.current.displayTxU?.h,
      `displayTxU height must be the persisted ${DISPLAY_H_PX_U} µpx, not the intrinsic ${INTRINSIC_PX_U}`,
    ).toBe(DISPLAY_H_PX_U)
    expect(result.current.displayTxU?.w).not.toBe(INTRINSIC_PX_U)
  })

  it("DOES adopt a real user-edit resize reported up through the same channel", () => {
    const { result, rerender, guardRef } = renderCanvasAndSource({
      xPxU: seed.xPxU!,
      yPxU: seed.yPxU!,
      widthPxU: DISPLAY_W_PX_U,
      heightPxU: DISPLAY_H_PX_U,
    })

    // The user drags a resize handle: the user-edit path marks the guard
    // BEFORE the canvas commits the new imageTx (transform-controller.ts).
    const RESIZED_W = 400n * 1_000_000n
    const RESIZED_H = 250n * 1_000_000n
    act(() => {
      guardRef.current.markUserChanged()
    })
    rerender({ imageTx: { xPxU: seed.xPxU!, yPxU: seed.yPxU!, widthPxU: RESIZED_W, heightPxU: RESIZED_H } })

    // A user edit DOES feed the source — the gate must not over-block.
    expect(result.current.displayTxU?.w).toBe(RESIZED_W)
    expect(result.current.displayTxU?.h).toBe(RESIZED_H)
  })

  it("after an active-image reset, a re-placement intrinsic still does not clobber the resize", async () => {
    // User resized to 400×250 (fed the source). A filter/trace apply flips
    // the active image → resetForNewImage() clears userChanged. The canvas
    // then re-places at the intrinsic during the reset window. That
    // re-placement is a SYSTEM change and must not overwrite the resize.
    const RESIZED_W = 400n * 1_000_000n
    const RESIZED_H = 250n * 1_000_000n
    const { result, rerender, guardRef } = renderCanvasAndSource({
      xPxU: seed.xPxU!,
      yPxU: seed.yPxU!,
      widthPxU: DISPLAY_W_PX_U,
      heightPxU: DISPLAY_H_PX_U,
    })
    act(() => {
      guardRef.current.markUserChanged()
    })
    rerender({ imageTx: { xPxU: seed.xPxU!, yPxU: seed.yPxU!, widthPxU: RESIZED_W, heightPxU: RESIZED_H } })
    expect(result.current.displayTxU?.w).toBe(RESIZED_W)

    // Active-image reset (filter/trace apply).
    act(() => {
      guardRef.current.resetForNewImage()
    })
    // Re-placement at intrinsic (system, no markUserChanged).
    rerender({ imageTx: { xPxU: 0n, yPxU: 0n, widthPxU: INTRINSIC_PX_U, heightPxU: INTRINSIC_PX_U } })

    await waitFor(() => expect(result.current.displayTxU?.w).toBe(RESIZED_W))
    expect(result.current.displayTxU?.h).toBe(RESIZED_H)
  })
})
