/**
 * @vitest-environment jsdom
 *
 * Hook-level tests for `useImageState`. Pure-helper tests
 * (`createPendingSlot`) live in the sibling `.ts` file.
 *
 * Focus:
 * - SSR seed survives initial mount.
 * - masterImageId transitions auto-reset the mirror.
 * - In-flight saves abort cleanly when master changes.
 */
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { saveImageState as saveImageStateApi } from "@/lib/api/image-state"
import { useImageState, type ImageState } from "./use-image-state"

vi.mock("@/lib/api/image-state", () => ({
  saveImageState: vi.fn(),
}))

vi.mock("@/lib/monitoring/with-error-reporting", () => ({
  reportClientError: vi.fn(),
}))

const saveImageStateApiMock = vi.mocked(saveImageStateApi)

const seed: ImageState = {
  xPxU: 0n,
  yPxU: 0n,
  widthPxU: 100_000_000n,
  heightPxU: 100_000_000n,
  rotationDeg: 0,
}

const otherTx: ImageState = {
  xPxU: 0n,
  yPxU: 0n,
  widthPxU: 200_000_000n,
  heightPxU: 200_000_000n,
  rotationDeg: 0,
}

describe("useImageState lifecycle", () => {
  beforeEach(() => {
    saveImageStateApiMock.mockReset()
  })

  it("SSR seed survives initial mount", () => {
    const { result } = renderHook(() => useImageState("p1", "master-A", seed))
    expect(result.current.initialImageTransform).toEqual(seed)
  })

  it("auto-resets the mirror when masterImageId changes", () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useImageState("p1", id, seed),
      { initialProps: { id: "master-A" } },
    )
    expect(result.current.initialImageTransform).toEqual(seed)

    rerender({ id: "master-B" })
    expect(result.current.initialImageTransform).toBe(null)
  })

  it("auto-resets when master becomes null (= delete)", () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useImageState("p1", id, seed),
      { initialProps: { id: "master-A" as string | null } },
    )
    rerender({ id: null })
    expect(result.current.initialImageTransform).toBe(null)
  })

  it("a fresh save replaces the mirror; then masterId change clears it", async () => {
    saveImageStateApiMock.mockResolvedValue(undefined)
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useImageState("p1", id, null),
      { initialProps: { id: "master-A" as string | null } },
    )

    await act(async () => {
      await result.current.saveImageState(otherTx)
    })
    expect(result.current.initialImageTransform).toEqual(otherTx)

    rerender({ id: "master-B" })
    expect(result.current.initialImageTransform).toBe(null)
  })

  it("aborts in-flight saves on masterId change (no stale mirror update)", async () => {
    // Build a controllable save: resolves only when we say so, and we
    // observe the AbortSignal passed in. The abort listener rejects
    // the SAME promise the implementation returns so flushOnce sees
    // the AbortError.
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

    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useImageState("p1", id, null),
      { initialProps: { id: "master-A" as string | null } },
    )

    // Fire save (don't await — leave it in-flight).
    let saveCall: Promise<void> | undefined
    act(() => {
      saveCall = result.current.saveImageState(otherTx)
    })

    // Wait for the fetch wrapper to have been called.
    await waitFor(() => expect(saveImageStateApiMock).toHaveBeenCalled())
    expect(receivedSignal).toBeDefined()

    // Trigger master change → reset should abort the in-flight controller.
    rerender({ id: "master-B" })
    expect(receivedSignal?.aborted).toBe(true)

    // Drain the aborted-save promise.
    await act(async () => {
      await saveCall?.catch(() => undefined)
    })

    // Mirror stays null — the aborted save MUST NOT call setPersistedTransform.
    expect(result.current.initialImageTransform).toBe(null)
  })
})
