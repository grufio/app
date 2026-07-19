/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ArtboardSurfaceScope, type ArtboardSurfaceScopeProps } from "./artboard-surface-scope"

// The real sheet pulls in dynamic panels + a wide prop surface; the channel
// behaviour is independent of its contents, so stub it. The scope now routes to
// a single merged Image dialog (Artboard folded in, Grid removed from the nav).
vi.mock("@/features/editor/components/image-sheet", () => ({
  ImageSheet: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="sheet-image">
      <button type="button" aria-label="close-sheet" onClick={onClose} />
    </div>
  ),
}))

// The stubbed sheet ignores all props, so an empty object is fine.
const baseProps = {} as ArtboardSurfaceScopeProps

describe("ArtboardSurfaceScope", () => {
  afterEach(() => cleanup())

  it("renders no sheet until a dialog is requested", () => {
    const { queryByTestId } = render(<ArtboardSurfaceScope {...baseProps} />)
    expect(queryByTestId("sheet-image")).toBeNull()
  })

  it("opens the image sheet on a pending request and consumes it", () => {
    const onConsumePendingDialog = vi.fn()
    const { queryByTestId, rerender } = render(
      <ArtboardSurfaceScope
        {...baseProps}
        pendingDialog={null}
        onConsumePendingDialog={onConsumePendingDialog}
      />,
    )
    expect(queryByTestId("sheet-image")).toBeNull()

    rerender(
      <ArtboardSurfaceScope
        {...baseProps}
        pendingDialog="image"
        onConsumePendingDialog={onConsumePendingDialog}
      />,
    )
    expect(queryByTestId("sheet-image")).not.toBeNull()
    expect(onConsumePendingDialog).toHaveBeenCalledTimes(1)
  })
})
