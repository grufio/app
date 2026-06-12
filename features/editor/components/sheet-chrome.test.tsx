/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { Grid3x3 } from "lucide-react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SheetAddRow, SheetHeader } from "./sheet-chrome"

afterEach(cleanup)

describe("SheetHeader", () => {
  it("renders the title and fires onClose from the Close button", () => {
    const onClose = vi.fn()
    const { getByText, getByLabelText } = render(<SheetHeader title="Grid" onClose={onClose} />)
    expect(getByText("Grid")).not.toBeNull()
    fireEvent.click(getByLabelText("Close"))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe("SheetAddRow", () => {
  it("renders the icon, label, and the action child", () => {
    const { getByText, getByLabelText, container } = render(
      <SheetAddRow Icon={Grid3x3} label="Grid">
        <button type="button" aria-label="Add Grid" />
      </SheetAddRow>,
    )
    expect(getByText("Grid")).not.toBeNull()
    expect(container.querySelector(".lucide-grid3x3, .lucide-grid-3x3")).not.toBeNull()
    expect(getByLabelText("Add Grid")).not.toBeNull()
  })
})
