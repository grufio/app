/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EditorImageDialogs } from "./editor-image-dialogs"

function baseProps() {
  return {
    restoreOpen: false,
    setRestoreOpen: vi.fn(),
    restoreBusy: false,
    restoreError: null,
    onRestoreImage: vi.fn(),
    deleteOpen: false,
    setDeleteOpen: vi.fn(),
    deleteBusy: false,
    deleteError: "",
    handleDeleteMasterImage: vi.fn(),
    cascadeFilterCount: 0,
    cascadeHasTrace: false,
  }
}

describe("EditorImageDialogs (relocated shell-root host)", () => {
  afterEach(() => cleanup())

  it("renders nothing visible when both dialogs are closed", () => {
    const { queryByText } = render(<EditorImageDialogs {...baseProps()} />)
    expect(queryByText("Restore image?")).toBeNull()
    expect(queryByText("Delete image?")).toBeNull()
  })

  it("shows the Restore dialog and fires onRestoreImage on confirm", () => {
    const props = { ...baseProps(), restoreOpen: true }
    const { getByText } = render(<EditorImageDialogs {...props} />)
    expect(getByText("Restore image?")).not.toBeNull()
    fireEvent.click(getByText("Restore"))
    expect(props.onRestoreImage).toHaveBeenCalledTimes(1)
  })

  it("shows the Delete dialog with cascade copy and fires the delete handler", () => {
    const props = {
      ...baseProps(),
      deleteOpen: true,
      cascadeFilterCount: 2,
      cascadeHasTrace: true,
    }
    const { getByText } = render(<EditorImageDialogs {...props} />)
    expect(getByText("Delete image?")).not.toBeNull()
    // buildDeleteMessage cascade copy surfaces in the dialog.
    expect(getByText(/2 filters and the trace overlay/)).not.toBeNull()
    fireEvent.click(getByText("Delete"))
    expect(props.handleDeleteMasterImage).toHaveBeenCalledTimes(1)
  })

  it("surfaces a delete error message when provided", () => {
    const props = { ...baseProps(), deleteOpen: true, deleteError: "boom" }
    const { getByRole } = render(<EditorImageDialogs {...props} />)
    expect(getByRole("alert").textContent).toContain("boom")
  })
})
