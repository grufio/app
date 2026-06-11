/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ArtboardSurfaceScope, type ArtboardSurfaceScopeProps } from "./artboard-surface-scope"

// The real sheets pull in dynamic panels + wide prop surfaces; the channel
// behaviour is independent of their contents, so stub each one and tag the
// dialog it represents.
vi.mock("@/features/editor/components/mobile-artboard-sheet", () => ({
  MobileArtboardSheet: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="sheet-artboard">
      <button type="button" aria-label="close-sheet" onClick={onClose} />
    </div>
  ),
}))
vi.mock("@/features/editor/components/mobile-grid-sheet", () => ({
  MobileGridSheet: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="sheet-grid">
      <button type="button" aria-label="close-sheet" onClick={onClose} />
    </div>
  ),
}))
vi.mock("@/features/editor/components/mobile-image-sheet", () => ({
  MobileImageSheet: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="sheet-image">
      <button type="button" aria-label="close-sheet" onClick={onClose} />
    </div>
  ),
}))

// The stubbed sheets ignore all artboard props, so an empty object is fine.
const baseProps = {} as ArtboardSurfaceScopeProps

describe("ArtboardSurfaceScope", () => {
  afterEach(() => cleanup())

  it("renders no sheet until a dialog is requested", () => {
    const { queryByTestId } = render(<ArtboardSurfaceScope {...baseProps} />)
    expect(queryByTestId("sheet-artboard")).toBeNull()
    expect(queryByTestId("sheet-grid")).toBeNull()
    expect(queryByTestId("sheet-image")).toBeNull()
  })

  it.each(["artboard", "grid", "image"] as const)(
    "opens the %s sheet on a pending request and consumes it",
    (dialog) => {
      const onConsumePendingDialog = vi.fn()
      const { queryByTestId, rerender } = render(
        <ArtboardSurfaceScope
          {...baseProps}
          pendingDialog={null}
          onConsumePendingDialog={onConsumePendingDialog}
        />,
      )
      expect(queryByTestId(`sheet-${dialog}`)).toBeNull()

      rerender(
        <ArtboardSurfaceScope
          {...baseProps}
          pendingDialog={dialog}
          onConsumePendingDialog={onConsumePendingDialog}
        />,
      )
      expect(queryByTestId(`sheet-${dialog}`)).not.toBeNull()
      expect(onConsumePendingDialog).toHaveBeenCalledTimes(1)
    },
  )
})
