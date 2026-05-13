/**
 * @vitest-environment jsdom
 *
 * Tests for `useDedupingErrorToast` + `showOperationErrorToast`.
 *
 * The dedup contract is the core value of this hook — without it,
 * a parent re-render that reconstructs an error-object literal would
 * fire a fresh toast every time. Verified here:
 *   - `correlationId` (when present) is the dedup key.
 *   - Falls back to `stage|message` when correlationId is absent.
 *   - Transitioning to null resets the latch (so a re-occurrence of
 *     the same error after a successful gap fires a fresh toast).
 *   - Wrapping non-OperationError values goes through `normalizeApiError`.
 */
import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { OperationError } from "@/lib/api/operation-error"

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}))

import { toast } from "sonner"
import { showOperationErrorToast, useDedupingErrorToast } from "./use-deduping-error-toast"

describe("useDedupingErrorToast", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear()
  })

  it("fires no toast when error is null", () => {
    renderHook(() => useDedupingErrorToast(null))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("fires a toast for a fresh OperationError", () => {
    const err: OperationError = { stage: "filter_apply", message: "boom", correlationId: "c-1" }
    renderHook(() => useDedupingErrorToast(err))
    expect(toast.error).toHaveBeenCalledTimes(1)
  })

  it("dedups on identical correlationId across re-renders", () => {
    const err: OperationError = { stage: "filter_apply", message: "boom", correlationId: "c-1" }
    const { rerender } = renderHook(({ e }: { e: OperationError | null }) => useDedupingErrorToast(e), {
      initialProps: { e: err },
    })
    // Re-render with a NEW object identity but same correlationId.
    rerender({ e: { ...err } })
    rerender({ e: { ...err } })
    expect(toast.error).toHaveBeenCalledTimes(1)
  })

  it("fires again when correlationId changes (distinct server request)", () => {
    const { rerender } = renderHook(({ e }: { e: OperationError | null }) => useDedupingErrorToast(e), {
      initialProps: { e: { stage: "filter_apply", message: "boom", correlationId: "c-1" } as OperationError },
    })
    rerender({ e: { stage: "filter_apply", message: "boom", correlationId: "c-2" } as OperationError })
    expect(toast.error).toHaveBeenCalledTimes(2)
  })

  it("uses stage|message as dedup key when correlationId is absent", () => {
    const a: OperationError = { stage: "save", message: "x" }
    const b: OperationError = { stage: "save", message: "x" }
    const c: OperationError = { stage: "save", message: "y" }
    const { rerender } = renderHook(({ e }: { e: OperationError | null }) => useDedupingErrorToast(e), {
      initialProps: { e: a },
    })
    rerender({ e: b })
    expect(toast.error).toHaveBeenCalledTimes(1)
    rerender({ e: c })
    expect(toast.error).toHaveBeenCalledTimes(2)
  })

  it("transitioning to null resets the latch", () => {
    const err: OperationError = { stage: "save", message: "boom", correlationId: "c-1" }
    const { rerender } = renderHook(({ e }: { e: OperationError | null }) => useDedupingErrorToast(e), {
      initialProps: { e: err as OperationError | null },
    })
    expect(toast.error).toHaveBeenCalledTimes(1)
    rerender({ e: null })
    // Same correlationId again after a null gap → fresh toast.
    rerender({ e: err })
    expect(toast.error).toHaveBeenCalledTimes(2)
  })

  it("normalizes a thrown Error before toasting", () => {
    const raw = new Error("network down")
    renderHook(() => useDedupingErrorToast(raw))
    expect(toast.error).toHaveBeenCalledTimes(1)
  })
})

describe("showOperationErrorToast (fire-once helper)", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear()
  })

  it("fires immediately for an OperationError", () => {
    showOperationErrorToast({ stage: "save", message: "x", correlationId: "c-1" })
    expect(toast.error).toHaveBeenCalledTimes(1)
  })

  it("normalizes unknown thrown values before toasting", () => {
    showOperationErrorToast(new Error("oops"))
    showOperationErrorToast("plain string error")
    expect(toast.error).toHaveBeenCalledTimes(2)
  })

  it("appends correlationId reference into the description when present", () => {
    showOperationErrorToast({ stage: "save", message: "x", correlationId: "abc-123" })
    const lastCall = vi.mocked(toast.error).mock.calls.at(-1)
    expect(lastCall?.[1]?.description).toContain("[ref: abc-123]")
  })
})
