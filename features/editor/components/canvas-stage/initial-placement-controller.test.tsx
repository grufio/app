/**
 * @vitest-environment jsdom
 *
 * Hook-level sequencing tests for `useInitialImagePlacement`.
 *
 * The pure gating logic is covered in `placement.test.ts`. This file
 * pins the EFFECT sequencing — specifically the prod-reload race where
 * the persisted display transform arrives AFTER the image has already
 * been placed at its intrinsic size (the authoritative display source,
 * `use-display-size`, seeds `displayTxU` from SSR/re-seed asynchronously
 * relative to the `img` load).
 *
 * Reproduces arch_trace_layer_root: master/source bitmap 1254×1254,
 * persisted display 283×567. The image must end up at 283×567, not the
 * 1254-derived intrinsic placement.
 */
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createStateSyncGuard } from "./state-sync-guard"
import { useInitialImagePlacement } from "./initial-placement-controller"

type Tx = { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint }

const PX_U = (px: number) => BigInt(px) * 1_000_000n

// Prod shape.
const MASTER = 1254
const DISPLAY_W = 283
const DISPLAY_H = 567
const ARTW = 595
const ARTH = 842
const SRC = "signed://working-copy.png"
const ACTIVE_ID = "active-1"

function flushMicrotasks() {
  // `scheduleApply` defers via queueMicrotask; drain them inside act.
  return act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe("useInitialImagePlacement — late persisted transform (prod reload race)", () => {
  beforeEach(() => {
    vi.useRealTimers()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("applies the persisted display size even when it arrives AFTER the intrinsic placement", async () => {
    const setImageTx = vi.fn<(t: Tx) => void>()
    const setRotation = vi.fn<(d: number) => void>()
    const scheduleBoundsUpdate = vi.fn<() => void>()
    const placedKeyRef = { current: null as string | null }
    const stateSyncGuardRef = { current: createStateSyncGuard() }

    const baseProps = {
      src: SRC,
      img: { naturalWidth: MASTER, naturalHeight: MASTER },
      hasArtboard: true,
      artW: ARTW,
      artH: ARTH,
      imageDpi: 72,
      intrinsicWidthPx: MASTER,
      intrinsicHeightPx: MASTER,
      activeImageId: ACTIVE_ID,
      placedKeyRef,
      stateSyncGuardRef,
      setRotation,
      setImageTx,
      scheduleBoundsUpdate,
    }

    // 1. First mount WITHOUT persisted transform (displayTxU not seeded
    //    yet — the SSR/re-seed GET is still in flight). The image is
    //    placed at its intrinsic size.
    const { rerender } = renderHook((props) => useInitialImagePlacement(props), {
      initialProps: { ...baseProps, initialImageTransform: null as null | Tx },
    })
    await flushMicrotasks()

    // Intrinsic placement applied: at dpi 72 the 1254 source maps 1:1.
    expect(setImageTx).toHaveBeenCalled()
    const intrinsicCall = setImageTx.mock.calls.at(-1)?.[0]
    expect(intrinsicCall?.widthPxU).toBe(PX_U(MASTER))
    expect(intrinsicCall?.heightPxU).toBe(PX_U(MASTER))

    // 2. The persisted display transform now arrives (the re-seed
    //    resolved → displayTxU = 283×567 → initialImageTransform updates).
    const persisted: Tx = {
      xPxU: PX_U(297),
      yPxU: PX_U(421),
      widthPxU: PX_U(DISPLAY_W),
      heightPxU: PX_U(DISPLAY_H),
    }
    rerender({ ...baseProps, initialImageTransform: persisted })
    await flushMicrotasks()

    // 3. The image MUST end up at the persisted display size. Pre-fix it
    //    stayed at the intrinsic 1254 (the user's reported symptom): the
    //    placement effect's intrinsic branch had already set
    //    `placedKeyRef.current = key` for this `src`, and the late
    //    persisted re-run is gated out, so `setImageTx` was never called
    //    with 283×567.
    const finalCall = setImageTx.mock.calls.at(-1)?.[0]
    expect(
      finalCall?.widthPxU,
      `image width must be the persisted display ${DISPLAY_W}px, not the intrinsic ${MASTER}px`,
    ).toBe(PX_U(DISPLAY_W))
    expect(
      finalCall?.heightPxU,
      `image height must be the persisted display ${DISPLAY_H}px, not the intrinsic ${MASTER}px`,
    ).toBe(PX_U(DISPLAY_H))
  })
})
