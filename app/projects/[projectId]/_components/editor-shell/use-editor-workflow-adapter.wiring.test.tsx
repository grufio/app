/**
 * @vitest-environment jsdom
 *
 * Client-wiring guard (P0-5): the `useImageState` reset key MUST be fed
 * from `masterImage.masterRowId` (the immutable kind='master' row id),
 * NOT `masterImage.id` (the active editor target that flips on every
 * filter/crop/trace apply).
 *
 * Why this test exists separately from the hook test:
 *   `use-image-state.hook.test.tsx` passes `masterImageId` opaquely as a
 *   string ("master-A" -> "master-B") and verifies the hook resets on
 *   value change. That pins the hook's behaviour but CANNOT detect which
 *   field the adapter wires in. The HEAD bug class was the adapter
 *   feeding the WRONG field (`.id`), which flips on apply and discards
 *   the user's persisted transform.
 *
 *   The sibling `use-editor-workflow-adapter.test.ts` only exercises the
 *   pure `deriveEditorSourceSnapshot` with `{ id: "m1" }` (no
 *   `masterRowId`) and never touches the `useImageState` reset key. So
 *   neither existing test pins the selector. This one does.
 *
 * Strategy: mock `@/lib/editor/hooks/use-image-state` so the adapter's
 * call captures the exact 2nd argument it receives. Render the real
 * adapter, then drive the two structural transitions:
 *   1. Apply (active id A -> A', masterRowId constant B) -> reset key
 *      stays constant B (mirror NOT nulled).
 *   2. Master replace (masterRowId B -> C) -> reset key changes to C
 *      (mirror nulled by the hook's useUpdateEffect).
 *
 * Rot if the wiring ever falls back to `masterImage.id`: in transition 1
 * the captured 2nd arg would flip A -> A', failing the "stays B"
 * assertion.
 */
import { renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Capture every (projectId, masterImageId, initial) call to useImageState.
const useImageStateCalls: Array<{
  projectId: string
  masterImageId: string | null
  initial: unknown
}> = []

vi.mock("@/lib/editor/hooks/use-image-state", () => ({
  useImageState: (projectId: string, masterImageId: string | null, initial: unknown) => {
    useImageStateCalls.push({ projectId, masterImageId, initial })
    return { initialImageTransform: null, saveImageState: vi.fn() }
  },
}))

// The workflow machine pulls in xstate-react + the filter registry. We
// only care about the reset-key wiring, so stub the machine to a stable,
// side-effect-free shape. (A real machine would also work, but stubbing
// keeps the test deterministic and focused on the wiring contract.)
vi.mock("@/lib/editor/machines/use-image-workflow-machine", () => ({
  useImageWorkflowMachine: () => ({
    readModel: { status: "empty", image: null, error: "" },
    applyFilter: vi.fn(),
    dismissError: vi.fn(),
    lastOperation: null,
    operationError: null,
    persistenceError: null,
  }),
}))

import { useEditorWorkflowAdapter } from "./use-editor-workflow-adapter"

type MasterImage = {
  id?: string
  masterRowId?: string | null
  signedUrl?: string
  name?: string
  width_px?: number
  height_px?: number
}

function baseArgs(masterImage: MasterImage) {
  return {
    projectId: "proj-1",
    initialImageState: null,
    masterImage,
    masterImageLoading: false,
    masterImageError: "",
    filterDisplayImageWithoutTrace: null,
    filterImageLoading: false,
    filterImageLoadedOnce: true,
    filterImageError: "",
    filterImageEmptyReason: null as "no_active_image" | null,
    refreshMasterImage: vi.fn(async () => {}),
    refreshProjectImages: vi.fn(async () => {}),
    refreshFilterImage: vi.fn(async () => {}),
    seedMasterImage: vi.fn(),
  }
}

describe("useEditorWorkflowAdapter — reset-key wiring", () => {
  afterEach(() => {
    useImageStateCalls.length = 0
  })

  it("feeds masterRowId (constant across apply), NOT the flipping active id", () => {
    // Active id A, stable master row B.
    const { rerender } = renderHook(
      ({ master }: { master: MasterImage }) => useEditorWorkflowAdapter(baseArgs(master)),
      { initialProps: { master: { id: "img-A", masterRowId: "master-B" } } },
    )

    const firstCall = useImageStateCalls[0]
    expect(firstCall.masterImageId).toBe("master-B")
    // Defensive: it must NOT be the active editor-target id.
    expect(firstCall.masterImageId).not.toBe("img-A")

    // Apply a filter/crop/trace: the active id flips A -> A', but the
    // stable master row stays B. The reset key MUST stay B so the
    // persisted transform mirror is NOT discarded.
    rerender({ master: { id: "img-A-prime", masterRowId: "master-B" } })

    const lastCall = useImageStateCalls[useImageStateCalls.length - 1]
    expect(lastCall.masterImageId).toBe("master-B")
    // Rot if wiring uses `.id`: it would now be "img-A-prime".
    expect(lastCall.masterImageId).not.toBe("img-A-prime")

    // Every observed reset key across the apply transition is constant B.
    expect(useImageStateCalls.every((c) => c.masterImageId === "master-B")).toBe(true)
  })

  it("changes the reset key on a real master replace (masterRowId B -> C)", () => {
    const { rerender } = renderHook(
      ({ master }: { master: MasterImage }) => useEditorWorkflowAdapter(baseArgs(master)),
      { initialProps: { master: { id: "img-A", masterRowId: "master-B" } } },
    )
    expect(useImageStateCalls[0].masterImageId).toBe("master-B")

    // Replace the master entirely: a brand-new master row C with its own
    // working copy active. The reset key MUST change to C so the hook
    // nulls the stale mirror.
    rerender({ master: { id: "img-C-wc", masterRowId: "master-C" } })

    const lastCall = useImageStateCalls[useImageStateCalls.length - 1]
    expect(lastCall.masterImageId).toBe("master-C")
  })

  it("maps a null masterRowId to null (master delete = mirror reset)", () => {
    renderHook(() =>
      useEditorWorkflowAdapter(baseArgs({ id: "img-A", masterRowId: null })),
    )
    expect(useImageStateCalls[0].masterImageId).toBe(null)
  })
})
