/**
 * @vitest-environment jsdom
 *
 * Hook-level tests for `useCanvasTxMirror`. The pure-helper layer
 * (`deriveInitialImageTxU`) is covered by the sibling `.ts` test;
 * this file covers the stateful pieces:
 *
 *   - `imageTxU` setter wrapper with value-equality short-circuit
 *     (identity preserved across identical reports — important so
 *     useRightPanelModel doesn't re-derive on every canvas tick).
 *   - `handleNudge` math: gated on non-null state, dispatches the
 *     bigint delta through the canvas ref.
 *   - `clear()` resets the mirror.
 *   - `initialImageTxU` is the delegated pure-helper result.
 */
import { act, renderHook } from "@testing-library/react"
import { useRef } from "react"
import { describe, expect, it, vi } from "vitest"

import { useCanvasTxMirror } from "./use-canvas-tx-mirror"
import type { ProjectCanvasStageHandle } from "@/features/editor"

function makeCanvasRefStub(setImagePosition = vi.fn()) {
  return {
    current: { setImagePosition } as unknown as ProjectCanvasStageHandle,
  }
}

describe("useCanvasTxMirror", () => {
  it("imageTxU starts null until handleImageTransformChange fires", () => {
    const { result } = renderHook(() =>
      useCanvasTxMirror({
        canvasRef: makeCanvasRefStub(),
        activeCanvasImageId: "img-1",
        initialImageTransform: null,
        masterImageId: "master-A",
      })
    )
    expect(result.current.imageTxU).toBe(null)
  })

  it("handleImageTransformChange stores tx", () => {
    const { result } = renderHook(() =>
      useCanvasTxMirror({
        canvasRef: makeCanvasRefStub(),
        activeCanvasImageId: "img-1",
        initialImageTransform: null,
        masterImageId: "master-A",
      })
    )
    act(() => {
      result.current.handleImageTransformChange({
        xPxU: 5n,
        yPxU: 6n,
        widthPxU: 100n,
        heightPxU: 200n,
      })
    })
    expect(result.current.imageTxU).toEqual({ x: 5n, y: 6n, w: 100n, h: 200n })
  })

  it("handleImageTransformChange(null) clears state", () => {
    const { result } = renderHook(() =>
      useCanvasTxMirror({
        canvasRef: makeCanvasRefStub(),
        activeCanvasImageId: "img-1",
        initialImageTransform: null,
        masterImageId: "master-A",
      })
    )
    act(() => {
      result.current.handleImageTransformChange({ xPxU: 1n, yPxU: 2n, widthPxU: 3n, heightPxU: 4n })
    })
    act(() => {
      result.current.handleImageTransformChange(null)
    })
    expect(result.current.imageTxU).toBe(null)
  })

  it("identical tx preserves state identity (equality short-circuit)", () => {
    // The short-circuit avoids consumer churn (e.g. right-panel
    // memo deps) when the canvas reports an unchanged transform.
    const { result } = renderHook(() =>
      useCanvasTxMirror({
        canvasRef: makeCanvasRefStub(),
        activeCanvasImageId: "img-1",
        initialImageTransform: null,
        masterImageId: "master-A",
      })
    )
    act(() => {
      result.current.handleImageTransformChange({ xPxU: 1n, yPxU: 2n, widthPxU: 100n, heightPxU: 200n })
    })
    const first = result.current.imageTxU
    act(() => {
      result.current.handleImageTransformChange({ xPxU: 1n, yPxU: 2n, widthPxU: 100n, heightPxU: 200n })
    })
    expect(result.current.imageTxU).toBe(first)
  })

  it("resets the mirror to null when masterImageId changes", () => {
    // Replaces the explicit `clear()` method: the lifecycle is now
    // bound to the master row. Caller does not need to remember to
    // clean up on master delete or replace.
    const { result, rerender } = renderHook(
      ({ masterImageId }: { masterImageId: string | null }) =>
        useCanvasTxMirror({
          canvasRef: makeCanvasRefStub(),
          activeCanvasImageId: "img-1",
          initialImageTransform: null,
          masterImageId,
        }),
      { initialProps: { masterImageId: "master-A" as string | null } },
    )
    act(() => {
      result.current.handleImageTransformChange({ xPxU: 1n, yPxU: 2n, widthPxU: 3n, heightPxU: 4n })
    })
    expect(result.current.imageTxU).not.toBe(null)

    rerender({ masterImageId: "master-B" })
    expect(result.current.imageTxU).toBe(null)
  })

  it("resets the mirror when master is destroyed (masterImageId → null)", () => {
    const { result, rerender } = renderHook(
      ({ masterImageId }: { masterImageId: string | null }) =>
        useCanvasTxMirror({
          canvasRef: makeCanvasRefStub(),
          activeCanvasImageId: "img-1",
          initialImageTransform: null,
          masterImageId,
        }),
      { initialProps: { masterImageId: "master-A" as string | null } },
    )
    act(() => {
      result.current.handleImageTransformChange({ xPxU: 1n, yPxU: 2n, widthPxU: 3n, heightPxU: 4n })
    })
    rerender({ masterImageId: null })
    expect(result.current.imageTxU).toBe(null)
  })

  it("handleNudge is a no-op when imageTxU is null", () => {
    const setImagePosition = vi.fn()
    const { result } = renderHook(() =>
      useCanvasTxMirror({
        canvasRef: makeCanvasRefStub(setImagePosition),
        activeCanvasImageId: "img-1",
        initialImageTransform: null,
        masterImageId: "master-A",
      })
    )
    act(() => {
      result.current.handleNudge(10, 20)
    })
    expect(setImagePosition).not.toHaveBeenCalled()
  })

  it("handleNudge dispatches the bigint delta through the canvas ref", () => {
    const setImagePosition = vi.fn()
    const { result } = renderHook(() =>
      useCanvasTxMirror({
        canvasRef: makeCanvasRefStub(setImagePosition),
        activeCanvasImageId: "img-1",
        initialImageTransform: null,
        masterImageId: "master-A",
      })
    )
    act(() => {
      result.current.handleImageTransformChange({ xPxU: 1_000_000n, yPxU: 2_000_000n, widthPxU: 100n, heightPxU: 200n })
    })
    act(() => {
      result.current.handleNudge(3, -1)
    })
    // 1px = 1_000_000 µpx, so (+3, -1) px → (+3_000_000, -1_000_000) µpx
    expect(setImagePosition).toHaveBeenCalledWith({
      xPxU: 4_000_000n,
      yPxU: 1_000_000n,
    })
  })

  it("handleNudge rounds fractional px input before bigint conversion", () => {
    // The keyboard layer can produce sub-pixel deltas (e.g. high-dpi
    // mice). bigint conversion is integer-only — fractional input
    // must be rounded, not truncated, to keep the nudge symmetric.
    const setImagePosition = vi.fn()
    const { result } = renderHook(() =>
      useCanvasTxMirror({
        canvasRef: makeCanvasRefStub(setImagePosition),
        activeCanvasImageId: "img-1",
        initialImageTransform: null,
        masterImageId: "master-A",
      })
    )
    act(() => {
      result.current.handleImageTransformChange({ xPxU: 0n, yPxU: 0n, widthPxU: 100n, heightPxU: 100n })
    })
    act(() => {
      result.current.handleNudge(0.4, 0.6)
    })
    // Math.round(0.4) = 0, Math.round(0.6) = 1
    expect(setImagePosition).toHaveBeenCalledWith({ xPxU: 0n, yPxU: 1_000_000n })
  })

  it("initialImageTxU reflects the delegated deriveInitialImageTxU result", () => {
    const { result } = renderHook(() =>
      useCanvasTxMirror({
        canvasRef: makeCanvasRefStub(),
        activeCanvasImageId: "img-1",
        initialImageTransform: { xPxU: 5n, yPxU: 6n, widthPxU: 100n, heightPxU: 200n },
        masterImageId: "master-A",
      })
    )
    expect(result.current.initialImageTxU).toEqual({ x: 5n, y: 6n, w: 100n, h: 200n })
  })

  it("initialImageTxU is null when activeCanvasImageId is null", () => {
    const { result } = renderHook(() =>
      useCanvasTxMirror({
        canvasRef: makeCanvasRefStub(),
        activeCanvasImageId: null,
        initialImageTransform: { xPxU: 5n, yPxU: 6n, widthPxU: 100n, heightPxU: 200n },
        masterImageId: "master-A",
      })
    )
    expect(result.current.initialImageTxU).toBe(null)
  })

  it("canvasRef from useRef works as parameter (not just plain object)", () => {
    // Real consumers pass `useRef<ProjectCanvasStageHandle | null>(null)`
    // — verify the hook accepts that shape and handleNudge no-ops on
    // null current (e.g. before the canvas has mounted).
    const setImagePosition = vi.fn()
    const { result } = renderHook(() => {
      const ref = useRef<ProjectCanvasStageHandle | null>(null)
      const mirror = useCanvasTxMirror({
        canvasRef: ref,
        activeCanvasImageId: "img-1",
        initialImageTransform: null,
        masterImageId: "master-A",
      })
      return { mirror, ref }
    })
    act(() => {
      result.current.mirror.handleImageTransformChange({ xPxU: 0n, yPxU: 0n, widthPxU: 100n, heightPxU: 100n })
    })
    // ref.current is null → handleNudge no-ops, setImagePosition not called.
    act(() => {
      result.current.mirror.handleNudge(1, 1)
    })
    expect(setImagePosition).not.toHaveBeenCalled()
  })
})
