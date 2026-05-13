/**
 * @vitest-environment jsdom
 *
 * Tests for `useFilterStackActions`. Covers:
 *   - Optimistic toggle fires the session setter immediately.
 *   - API success path → refreshFilterImage runs.
 *   - API failure path → toggle reverts, toast fires, telemetry fires.
 *   - Prune effect: hidden ids no longer in the stack get pruned.
 *   - Hydrate effect: server `is_hidden` re-applied to session map
 *     on every filterStack refresh.
 *   - Unknown filterId → no-op (no API call).
 */
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/project-images", () => ({
  setProjectImageFilterHidden: vi.fn(),
}))
vi.mock("@/lib/monitoring/with-error-reporting", () => ({
  reportClientError: vi.fn(),
}))
vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}))

import { setProjectImageFilterHidden } from "@/lib/api/project-images"
import { reportClientError } from "@/lib/monitoring/with-error-reporting"
import { toast } from "sonner"
import { useFilterStackActions } from "./use-filter-stack-actions"

type FilterItem = { id: string; is_hidden: boolean }

function makeArgs(overrides?: {
  filterStack?: FilterItem[]
  refreshFilterImage?: () => Promise<void>
  toggleHiddenFilter?: (id: string) => void
  showFilter?: (id: string) => void
  hideFilter?: (id: string) => void
  pruneHiddenFilters?: (knownIds: Set<string>) => void
}) {
  return {
    filterStack: overrides?.filterStack ?? [],
    projectId: "p-1",
    refreshFilterImage: overrides?.refreshFilterImage ?? vi.fn(async () => {}),
    toggleHiddenFilter: overrides?.toggleHiddenFilter ?? vi.fn(),
    showFilter: overrides?.showFilter ?? vi.fn(),
    hideFilter: overrides?.hideFilter ?? vi.fn(),
    pruneHiddenFilters: overrides?.pruneHiddenFilters ?? vi.fn(),
  }
}

describe("useFilterStackActions", () => {
  beforeEach(() => {
    vi.mocked(setProjectImageFilterHidden).mockReset()
    vi.mocked(reportClientError).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it("toggleHidden is a no-op for an unknown filterId", async () => {
    const args = makeArgs({ filterStack: [{ id: "f-1", is_hidden: false }] })
    const { result } = renderHook(() => useFilterStackActions(args))

    await act(async () => {
      await result.current.toggleHidden("does-not-exist")
    })

    expect(args.toggleHiddenFilter).not.toHaveBeenCalled()
    expect(setProjectImageFilterHidden).not.toHaveBeenCalled()
  })

  it("toggleHidden fires session toggle immediately (optimistic) then API + refresh on success", async () => {
    vi.mocked(setProjectImageFilterHidden).mockResolvedValue(undefined as unknown as never)
    const refreshFilterImage = vi.fn(async () => {})
    const toggleHiddenFilter = vi.fn()
    const args = makeArgs({
      filterStack: [{ id: "f-1", is_hidden: false }],
      refreshFilterImage,
      toggleHiddenFilter,
    })
    const { result } = renderHook(() => useFilterStackActions(args))

    await act(async () => {
      await result.current.toggleHidden("f-1")
    })

    // Session toggle fires once (the optimistic flip).
    expect(toggleHiddenFilter).toHaveBeenCalledTimes(1)
    expect(toggleHiddenFilter).toHaveBeenCalledWith("f-1")
    // API call uses the negated current is_hidden value.
    expect(setProjectImageFilterHidden).toHaveBeenCalledWith({
      projectId: "p-1",
      filterId: "f-1",
      isHidden: true,
    })
    expect(refreshFilterImage).toHaveBeenCalledTimes(1)
    expect(toast.error).not.toHaveBeenCalled()
    expect(reportClientError).not.toHaveBeenCalled()
  })

  it("on API failure, reverts the session toggle, fires toast, and reports telemetry", async () => {
    vi.mocked(setProjectImageFilterHidden).mockRejectedValue(new Error("save failed"))
    const refreshFilterImage = vi.fn(async () => {})
    const toggleHiddenFilter = vi.fn()
    const args = makeArgs({
      filterStack: [{ id: "f-1", is_hidden: false }],
      refreshFilterImage,
      toggleHiddenFilter,
    })
    const { result } = renderHook(() => useFilterStackActions(args))

    await act(async () => {
      await result.current.toggleHidden("f-1")
    })

    // Optimistic flip + revert flip = 2 calls.
    expect(toggleHiddenFilter).toHaveBeenCalledTimes(2)
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(reportClientError).toHaveBeenCalledTimes(1)
    expect(refreshFilterImage).not.toHaveBeenCalled()
  })

  it("prune effect: when filterStack changes, calls pruneHiddenFilters with the new id set", async () => {
    const pruneHiddenFilters = vi.fn()
    const initialStack: FilterItem[] = [
      { id: "f-1", is_hidden: false },
      { id: "f-2", is_hidden: false },
    ]
    const { rerender } = renderHook(({ stack }: { stack: FilterItem[] }) =>
      useFilterStackActions(makeArgs({ filterStack: stack, pruneHiddenFilters }))
    , { initialProps: { stack: initialStack } })

    await waitFor(() => {
      expect(pruneHiddenFilters).toHaveBeenCalled()
    })
    expect(pruneHiddenFilters.mock.calls.at(-1)?.[0]).toEqual(new Set(["f-1", "f-2"]))

    // Update stack: f-2 is removed, f-3 is added.
    pruneHiddenFilters.mockClear()
    const nextStack: FilterItem[] = [
      { id: "f-1", is_hidden: false },
      { id: "f-3", is_hidden: false },
    ]
    rerender({ stack: nextStack })

    await waitFor(() => {
      expect(pruneHiddenFilters).toHaveBeenCalled()
    })
    expect(pruneHiddenFilters.mock.calls.at(-1)?.[0]).toEqual(new Set(["f-1", "f-3"]))
  })

  it("hydrate effect: applies server is_hidden to the session map on every filterStack refresh", async () => {
    const hideFilter = vi.fn()
    const showFilter = vi.fn()
    const stack: FilterItem[] = [
      { id: "f-1", is_hidden: true },
      { id: "f-2", is_hidden: false },
      { id: "f-3", is_hidden: true },
    ]
    renderHook(() => useFilterStackActions(makeArgs({ filterStack: stack, hideFilter, showFilter })))

    await waitFor(() => {
      expect(hideFilter).toHaveBeenCalledWith("f-1")
    })
    expect(hideFilter).toHaveBeenCalledWith("f-3")
    expect(showFilter).toHaveBeenCalledWith("f-2")
    expect(hideFilter).toHaveBeenCalledTimes(2)
    expect(showFilter).toHaveBeenCalledTimes(1)
  })
})
