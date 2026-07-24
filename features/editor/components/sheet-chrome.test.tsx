/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { Check, Grid3x3 } from "lucide-react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { installMatchMedia } from "@/lib/test/jsdom-stubs"

import { SheetActionFooter, SheetAddRow, SheetHeader } from "./sheet-chrome"

afterEach(cleanup)

describe("SheetHeader", () => {
  beforeEach(() => installMatchMedia(true)) // mobile → header icons render

  it("renders the title and fires onClose from the Close button", () => {
    const onClose = vi.fn()
    const { getByText, getByLabelText } = render(<SheetHeader title="Grid" onClose={onClose} />)
    expect(getByText("Grid")).not.toBeNull()
    fireEvent.click(getByLabelText("Close"))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("renders action icons (mobile) alongside Close and fires them", () => {
    const onDone = vi.fn()
    const { getByLabelText } = render(
      <SheetHeader
        title="Image"
        onClose={vi.fn()}
        actions={[{ id: "done", label: "Done", icon: <Check />, onClick: onDone }]}
      />,
    )
    fireEvent.click(getByLabelText("Done"))
    expect(onDone).toHaveBeenCalledOnce()
    expect(getByLabelText("Close")).toBeTruthy()
  })
})

describe("SheetActionFooter", () => {
  beforeEach(() => installMatchMedia(false)) // desktop → footer text renders

  it("renders the actions as written-out text buttons (desktop)", () => {
    const onDone = vi.fn()
    const { getByRole } = render(
      <SheetActionFooter actions={[{ id: "done", label: "Done", icon: <Check />, onClick: onDone }]} />,
    )
    fireEvent.click(getByRole("button", { name: "Done" }))
    expect(onDone).toHaveBeenCalledOnce()
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
