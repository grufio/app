/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ArtboardSurfaceScope, type ArtboardSurfaceScopeProps } from "./artboard-surface-scope"

// The real sheet pulls in dynamic panels + a wide prop surface; the channel
// behaviour is independent of its contents, so stub it.
vi.mock("@/features/editor/components/mobile-artboard-sheet", () => ({
  MobileArtboardSheet: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="artboard-sheet">
      <button type="button" aria-label="close-sheet" onClick={onClose} />
    </div>
  ),
}))

// The stubbed sheet ignores all artboard props, so an empty object is fine.
const baseProps = {} as ArtboardSurfaceScopeProps

describe("ArtboardSurfaceScope", () => {
  afterEach(() => cleanup())

  it("keeps the sheet closed until requested", () => {
    const { queryByTestId } = render(<ArtboardSurfaceScope {...baseProps} />)
    expect(queryByTestId("artboard-sheet")).toBeNull()
  })

  it("opens the sheet on a pending request and consumes it", () => {
    const onConsumePendingEditOpen = vi.fn()
    const { queryByTestId, rerender } = render(
      <ArtboardSurfaceScope
        {...baseProps}
        pendingEditOpen={false}
        onConsumePendingEditOpen={onConsumePendingEditOpen}
      />,
    )
    expect(queryByTestId("artboard-sheet")).toBeNull()

    rerender(
      <ArtboardSurfaceScope
        {...baseProps}
        pendingEditOpen
        onConsumePendingEditOpen={onConsumePendingEditOpen}
      />,
    )
    expect(queryByTestId("artboard-sheet")).not.toBeNull()
    expect(onConsumePendingEditOpen).toHaveBeenCalledTimes(1)
  })
})
