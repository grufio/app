/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

import type { ImageWorkflowServices } from "./image-workflow.types"
import { useImageWorkflowMachine } from "./use-image-workflow-machine"

const EMPTY_FILTER = { image: null, imageWithoutTrace: null, stack: [], emptyReason: null, error: "" }

function createServices(overrides?: Partial<ImageWorkflowServices>): ImageWorkflowServices {
  return {
    applyFilter: vi.fn(async () => {}),
    removeFilter: vi.fn(async () => {}),
    applyCrop: vi.fn(async () => {}),
    restoreBase: vi.fn(async () => {}),
    refreshAll: vi.fn(async () => ({ master: null, filter: EMPTY_FILTER })),
    saveTransform: vi.fn(async () => {}),
    applyTrace: vi.fn(async () => {}),
    clearTrace: vi.fn(async () => {}),
    uploadMaster: vi.fn(async () => {}),
    deleteMaster: vi.fn(async () => {}),
    ...overrides,
  }
}

const READY_TIP = {
  id: "img_1",
  signedUrl: "u",
  width_px: 100,
  height_px: 80,
  storage_path: "",
  source_image_id: null,
  name: "Image",
  isFilterResult: false,
}

/** Drive the source to "ready" so mutations (TRACE_APPLY) are allowed. */
function makeReady(hook: { setFilter: (patch: Record<string, unknown>) => void }) {
  hook.setFilter({
    image: READY_TIP,
    imageWithoutTrace: READY_TIP,
    stack: [],
    emptyReason: null,
    error: "",
    loading: false,
    loadedOnce: true,
  })
}

/**
 * Regression guard for the trace/filter apply wait budget.
 *
 * The Cloud Run filter-service can legitimately take far longer than the 20s
 * instant-op wait — a cold start (scale-to-zero) or a high-MP trace (~64s at
 * 4MP). The bug: the frontend abandoned the wait at 20s, stranding the machine
 * in `applyingTrace` (the timer only rejects the UI promise, it never aborts
 * the actor), so any re-apply then hit "Trace apply is not allowed in the
 * current workflow state". The apply wait must outlast the backend budget
 * (`maxDuration = 120s`) so the UI observes the real outcome.
 */
describe("useImageWorkflowMachine — apply wait budget covers the Cloud Run backend", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it("a trace apply that resolves after >20s completes instead of falsely timing out", async () => {
    let resolveTrace: () => void = () => {}
    const services = createServices({
      applyTrace: vi.fn(() => new Promise<void>((res) => { resolveTrace = res })),
    })
    const { result } = renderHook(() => useImageWorkflowMachine({ services }))

    act(() => { makeReady(result.current) })

    let settled: "pending" | "resolved" | "rejected" = "pending"
    let pending!: Promise<void>
    act(() => {
      pending = result.current.applyTrace({ kind: "linerate" as RegisteredTraceId, params: {} })
      pending.then(() => { settled = "resolved" }, () => { settled = "rejected" })
    })

    // Past the OLD 20s wait but before the (slow) service resolves: the wait
    // must NOT have given up — the machine is still legitimately applying.
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(settled).toBe("pending")
    expect(result.current.isApplyingTrace).toBe(true)

    // The service finally resolves → applyingTrace → syncing → idle → the wait
    // resolves with the real outcome.
    await act(async () => {
      resolveTrace()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(settled).toBe("resolved")
  })
})
