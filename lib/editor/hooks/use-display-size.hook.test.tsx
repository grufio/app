/**
 * @vitest-environment jsdom
 *
 * Invariant-1 tests for `useDisplaySize` — the single authoritative
 * display-size source. Pure-helper tests (`createPendingSlot`,
 * `imageStateToDisplayTxU`) live in the sibling `.ts` file.
 *
 * These pin the architectural invariant, not a bug repro:
 *   - With a persisted resize seed, `displayTxU` resolves to THAT resize
 *     (never an intrinsic fallback — the hook has no intrinsic path).
 *   - The size HOLDS across an active-image transition (filter/crop/trace
 *     apply): the active editor target id flips, but the stable
 *     `masterImageId` (= masterRowId) does not, so the source must not
 *     reset.
 *   - A real master replace (masterImageId changes) RE-SEEDS from the DB
 *     instead of collapsing to null (in-session master swap has no fresh
 *     SSR seed).
 *   - A master delete (masterImageId → null) clears to null → the canvas
 *     does a fresh-upload intrinsic placement.
 */
import { act, renderHook, waitFor } from "@testing-library/react"
import { useRef } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getImageState, saveImageState as saveImageStateApi } from "@/lib/api/image-state"
import type { GetImageStateResponse } from "@/lib/editor/imageState"
import { useDisplaySize, type ImageState } from "./use-display-size"
import type { ProjectCanvasStageHandle } from "@/features/editor"

vi.mock("@/lib/api/image-state", () => ({
  getImageState: vi.fn(),
  saveImageState: vi.fn(),
}))

vi.mock("@/lib/monitoring/with-error-reporting", () => ({
  reportClientError: vi.fn(),
}))

const getImageStateMock = vi.mocked(getImageState)
const saveImageStateApiMock = vi.mocked(saveImageStateApi)

// 200 mm and 100 mm expressed as µpx at GEOMETRY_PPI=72: mm / 25.4 * 72 * 1e6
const W_200MM = 566929134n
const H_100MM = 283464567n

// A persisted resize: 2:1 aspect (NOT the square master intrinsic).
const resizeSeed: ImageState = {
  xPxU: 10n,
  yPxU: 20n,
  widthPxU: W_200MM,
  heightPxU: H_100MM,
  rotationDeg: 0,
}

function makeCanvasRefStub(setImagePosition = vi.fn()) {
  return { current: { setImagePosition } as unknown as ProjectCanvasStageHandle }
}

function renderDisplaySize(initialProps: {
  masterImageId: string | null
  initial: ImageState | null
}) {
  return renderHook(
    ({ masterImageId, initial }: { masterImageId: string | null; initial: ImageState | null }) => {
      const canvasRef = useRef<ProjectCanvasStageHandle | null>(makeCanvasRefStub().current)
      return useDisplaySize({ projectId: "p1", masterImageId, initial, canvasRef })
    },
    { initialProps },
  )
}

describe("useDisplaySize — Invariant 1", () => {
  beforeEach(() => {
    getImageStateMock.mockReset()
    saveImageStateApiMock.mockReset()
  })

  it("resolves the SSR resize seed (never an intrinsic fallback)", () => {
    const { result } = renderDisplaySize({ masterImageId: "master-A", initial: resizeSeed })
    // The one authoritative source IS the persisted resize — 2:1, not 1:1.
    expect(result.current.displayTxU).toEqual({ x: 10n, y: 20n, w: W_200MM, h: H_100MM })
    expect(result.current.displayTxU!.w).not.toBe(result.current.displayTxU!.h)
  })

  it("returns null for a genuine fresh upload (no persisted state)", () => {
    const { result } = renderDisplaySize({ masterImageId: "master-A", initial: null })
    // Null → the canvas placement controller does the intrinsic placement.
    expect(result.current.displayTxU).toBe(null)
  })

  it("HOLDS the resize across an active-image transition (masterImageId constant)", () => {
    // The stable masterImageId (masterRowId) stays "master-A" across a
    // filter/crop/trace apply — only the active editor target id flips,
    // which this hook does not even receive. Re-rendering with the same
    // masterImageId must NOT reset or re-fetch the size.
    const { result, rerender } = renderDisplaySize({ masterImageId: "master-A", initial: resizeSeed })
    expect(result.current.displayTxU).toEqual({ x: 10n, y: 20n, w: W_200MM, h: H_100MM })

    rerender({ masterImageId: "master-A", initial: resizeSeed })

    // Still the resize. No collapse to intrinsic, no re-fetch fired.
    expect(result.current.displayTxU).toEqual({ x: 10n, y: 20n, w: W_200MM, h: H_100MM })
    expect(getImageStateMock).not.toHaveBeenCalled()
  })

  it("a live user canvas commit updates the source", () => {
    const { result } = renderDisplaySize({ masterImageId: "master-A", initial: resizeSeed })
    act(() => {
      result.current.handleImageTransformChange({ xPxU: 1n, yPxU: 2n, widthPxU: 300n, heightPxU: 400n })
    })
    expect(result.current.displayTxU).toEqual({ x: 1n, y: 2n, w: 300n, h: 400n })
  })

  it("identical canvas reports preserve identity (no consumer churn)", () => {
    const { result } = renderDisplaySize({ masterImageId: "master-A", initial: null })
    act(() => {
      result.current.handleImageTransformChange({ xPxU: 1n, yPxU: 2n, widthPxU: 100n, heightPxU: 200n })
    })
    const first = result.current.displayTxU
    act(() => {
      result.current.handleImageTransformChange({ xPxU: 1n, yPxU: 2n, widthPxU: 100n, heightPxU: 200n })
    })
    expect(result.current.displayTxU).toBe(first)
  })

  it("RE-SEEDS from the DB on a real master replace (does NOT collapse to null)", async () => {
    // In-session master swap: masterImageId changes A → B. There is no
    // fresh SSR seed, so the hook fetches the new working_copy's persisted
    // state. Critically: the size does NOT silently fall back to intrinsic.
    const reseedRow: GetImageStateResponse = {
      exists: true,
      state: { width_px_u: "850393701", height_px_u: "850393701", rotation_deg: 0 },
    }
    getImageStateMock.mockResolvedValue(reseedRow)

    const { result, rerender } = renderDisplaySize({ masterImageId: "master-A", initial: resizeSeed })
    expect(result.current.displayTxU).toEqual({ x: 10n, y: 20n, w: W_200MM, h: H_100MM })

    rerender({ masterImageId: "master-B", initial: resizeSeed })

    await waitFor(() => expect(getImageStateMock).toHaveBeenCalledWith("p1"))
    await waitFor(() =>
      expect(result.current.displayTxU).toEqual({ x: 0n, y: 0n, w: 850393701n, h: 850393701n }),
    )
  })

  it("clears to null on a master replace whose new working_copy has no state", async () => {
    getImageStateMock.mockResolvedValue({ exists: false })
    const { result, rerender } = renderDisplaySize({ masterImageId: "master-A", initial: resizeSeed })
    rerender({ masterImageId: "master-B", initial: resizeSeed })
    await waitFor(() => expect(result.current.displayTxU).toBe(null))
  })

  it("clears to null on a master delete (masterImageId → null), no re-fetch", async () => {
    const { result, rerender } = renderDisplaySize({ masterImageId: "master-A", initial: resizeSeed })
    rerender({ masterImageId: null, initial: resizeSeed })
    await waitFor(() => expect(result.current.displayTxU).toBe(null))
    // A delete has no working copy to read — no GET should fire.
    expect(getImageStateMock).not.toHaveBeenCalled()
  })

  it("clears to null if the re-seed fetch fails (no stale size masquerades)", async () => {
    getImageStateMock.mockRejectedValue(new Error("network"))
    const { result, rerender } = renderDisplaySize({ masterImageId: "master-A", initial: resizeSeed })
    rerender({ masterImageId: "master-B", initial: resizeSeed })
    await waitFor(() => expect(result.current.displayTxU).toBe(null))
  })

  it("getCurrentImageState returns the full transform incl. persisted rotation", () => {
    const { result } = renderDisplaySize({
      masterImageId: "master-A",
      initial: { ...resizeSeed, rotationDeg: 90 },
    })
    expect(result.current.getCurrentImageState()).toEqual({
      xPxU: 10n,
      yPxU: 20n,
      widthPxU: W_200MM,
      heightPxU: H_100MM,
      rotationDeg: 90,
    })
  })

  it("getCurrentImageState returns null when there is no source", () => {
    const { result } = renderDisplaySize({ masterImageId: "master-A", initial: null })
    expect(result.current.getCurrentImageState()).toBe(null)
  })

  it("handleNudge dispatches the bigint delta through the canvas ref", () => {
    const setImagePosition = vi.fn()
    const { result } = renderHook(() => {
      const canvasRef = useRef<ProjectCanvasStageHandle | null>(makeCanvasRefStub(setImagePosition).current)
      return useDisplaySize({ projectId: "p1", masterImageId: "master-A", initial: resizeSeed, canvasRef })
    })
    act(() => {
      result.current.handleImageTransformChange({ xPxU: 1_000_000n, yPxU: 2_000_000n, widthPxU: 100n, heightPxU: 200n })
    })
    act(() => {
      result.current.handleNudge(3, -1)
    })
    expect(setImagePosition).toHaveBeenCalledWith({ xPxU: 4_000_000n, yPxU: 1_000_000n })
  })

  it("handleNudge is a no-op when there is no source", () => {
    const setImagePosition = vi.fn()
    const { result } = renderHook(() => {
      const canvasRef = useRef<ProjectCanvasStageHandle | null>(makeCanvasRefStub(setImagePosition).current)
      return useDisplaySize({ projectId: "p1", masterImageId: "master-A", initial: null, canvasRef })
    })
    act(() => {
      result.current.handleNudge(10, 20)
    })
    expect(setImagePosition).not.toHaveBeenCalled()
  })

  it("persists a user-edit save through the API", async () => {
    saveImageStateApiMock.mockResolvedValue(undefined)
    const { result } = renderDisplaySize({ masterImageId: "master-A", initial: null })
    await act(async () => {
      await result.current.saveImageState({ widthPxU: 100n, heightPxU: 200n, rotationDeg: 0 })
    })
    expect(saveImageStateApiMock).toHaveBeenCalledTimes(1)
  })

  it("getCurrentImageState reflects the rotation from the latest save (not the stale seed)", async () => {
    // The live canvas feed (handleImageTransformChange) carries no
    // rotation; the save payload does. After a rotate→save, the
    // trace-apply pre-save must see the new rotation, not the seed's.
    saveImageStateApiMock.mockResolvedValue(undefined)
    const { result } = renderDisplaySize({
      masterImageId: "master-A",
      initial: { ...resizeSeed, rotationDeg: 0 },
    })
    await act(async () => {
      await result.current.saveImageState({
        xPxU: 10n,
        yPxU: 20n,
        widthPxU: W_200MM,
        heightPxU: H_100MM,
        rotationDeg: 90,
      })
    })
    // Size/position still come from the live source; rotation now 90.
    expect(result.current.getCurrentImageState()).toEqual({
      xPxU: 10n,
      yPxU: 20n,
      widthPxU: W_200MM,
      heightPxU: H_100MM,
      rotationDeg: 90,
    })
  })

  it("aborts in-flight saves on a master transition (no stale write)", async () => {
    let receivedSignal: AbortSignal | undefined
    saveImageStateApiMock.mockImplementationOnce(
      (_pid, _body, opts) =>
        new Promise<void>((_resolve, reject) => {
          receivedSignal = opts?.signal
          opts?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted") as Error & { name: string }
            err.name = "AbortError"
            reject(err)
          })
        }),
    )
    getImageStateMock.mockResolvedValue({ exists: false })

    const { result, rerender } = renderDisplaySize({ masterImageId: "master-A", initial: null })

    let saveCall: Promise<void> | undefined
    act(() => {
      saveCall = result.current.saveImageState({ widthPxU: 300n, heightPxU: 400n, rotationDeg: 0 })
    })
    await waitFor(() => expect(saveImageStateApiMock).toHaveBeenCalled())
    expect(receivedSignal).toBeDefined()

    rerender({ masterImageId: "master-B", initial: null })
    expect(receivedSignal?.aborted).toBe(true)

    await act(async () => {
      await saveCall?.catch(() => undefined)
    })
  })
})
