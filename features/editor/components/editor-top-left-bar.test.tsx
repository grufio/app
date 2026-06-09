/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EditorTopLeftBar } from "./editor-top-left-bar"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

describe("EditorTopLeftBar", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders Home + four section buttons with the user-facing labels", () => {
    const { getByLabelText } = render(<EditorTopLeftBar />)
    expect(getByLabelText("Home")).not.toBeNull()
    expect(getByLabelText("Image")).not.toBeNull()
    expect(getByLabelText("Filter")).not.toBeNull()
    expect(getByLabelText("Trace")).not.toBeNull()
    expect(getByLabelText("Color")).not.toBeNull()
  })

  it("renders Home as a link to /dashboard", () => {
    const { getByLabelText } = render(<EditorTopLeftBar />)
    const home = getByLabelText("Home") as HTMLAnchorElement
    expect(home.tagName).toBe("A")
    expect(home.getAttribute("href")).toBe("/dashboard")
  })

  it("invokes onSectionTap with the corresponding section key", () => {
    const onSectionTap = vi.fn()
    const { getByLabelText } = render(<EditorTopLeftBar onSectionTap={onSectionTap} />)
    fireEvent.click(getByLabelText("Image"))
    expect(onSectionTap).toHaveBeenLastCalledWith("artboard")
    fireEvent.click(getByLabelText("Filter"))
    expect(onSectionTap).toHaveBeenLastCalledWith("filter")
    fireEvent.click(getByLabelText("Trace"))
    expect(onSectionTap).toHaveBeenLastCalledWith("trace")
    fireEvent.click(getByLabelText("Color"))
    expect(onSectionTap).toHaveBeenLastCalledWith("colors")
    expect(onSectionTap).toHaveBeenCalledTimes(4)
  })

  it("marks only the active section as aria-pressed", () => {
    const { getByLabelText } = render(<EditorTopLeftBar activeSection="trace" />)
    expect(getByLabelText("Trace").getAttribute("aria-pressed")).toBe("true")
    expect(getByLabelText("Image").getAttribute("aria-pressed")).not.toBe("true")
    expect(getByLabelText("Filter").getAttribute("aria-pressed")).not.toBe("true")
    expect(getByLabelText("Color").getAttribute("aria-pressed")).not.toBe("true")
  })

  it("renders Home and section group as two separate pill containers", () => {
    const { container } = render(<EditorTopLeftBar />)
    const pills = container.querySelectorAll(":scope > div > div")
    expect(pills.length).toBe(2)
  })
})
