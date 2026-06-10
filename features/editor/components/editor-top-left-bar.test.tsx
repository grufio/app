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

  it("invokes onSectionTap for Image / Filter / Color but not for Trace", () => {
    const onSectionTap = vi.fn()
    const { getByLabelText } = render(<EditorTopLeftBar onSectionTap={onSectionTap} />)
    fireEvent.click(getByLabelText("Image"))
    expect(onSectionTap).toHaveBeenLastCalledWith("artboard")
    fireEvent.click(getByLabelText("Filter"))
    expect(onSectionTap).toHaveBeenLastCalledWith("filter")
    fireEvent.click(getByLabelText("Color"))
    expect(onSectionTap).toHaveBeenLastCalledWith("colors")
    expect(onSectionTap).toHaveBeenCalledTimes(3)
    fireEvent.click(getByLabelText("Trace"))
    expect(onSectionTap).toHaveBeenCalledTimes(3)
  })

  it("marks only the active section as aria-pressed", () => {
    const { getByLabelText } = render(<EditorTopLeftBar activeSection="filter" />)
    expect(getByLabelText("Filter").getAttribute("aria-pressed")).toBe("true")
    expect(getByLabelText("Image").getAttribute("aria-pressed")).not.toBe("true")
    expect(getByLabelText("Trace").getAttribute("aria-pressed")).not.toBe("true")
    expect(getByLabelText("Color").getAttribute("aria-pressed")).not.toBe("true")
  })

  it("toggles a sub-pill with three trace-kind icons on Trace tap", () => {
    const { getByLabelText, queryByLabelText } = render(<EditorTopLeftBar />)
    expect(queryByLabelText("Pixelate")).toBeNull()
    expect(queryByLabelText("Circulate")).toBeNull()
    expect(queryByLabelText("Lineart")).toBeNull()
    fireEvent.click(getByLabelText("Trace"))
    expect(getByLabelText("Pixelate")).not.toBeNull()
    expect(getByLabelText("Circulate")).not.toBeNull()
    expect(getByLabelText("Lineart")).not.toBeNull()
    expect(getByLabelText("Trace").getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(getByLabelText("Trace"))
    expect(queryByLabelText("Pixelate")).toBeNull()
  })

  it("invokes onTraceKindTap with the picked kind and closes the sub-pill when hasTrace is false", () => {
    const onTraceKindTap = vi.fn()
    const { getByLabelText, queryByLabelText } = render(
      <EditorTopLeftBar onTraceKindTap={onTraceKindTap} />,
    )
    fireEvent.click(getByLabelText("Trace"))
    fireEvent.click(getByLabelText("Pixelate"))
    expect(onTraceKindTap).toHaveBeenLastCalledWith("pixelate")
    expect(queryByLabelText("Pixelate")).toBeNull()
    fireEvent.click(getByLabelText("Trace"))
    fireEvent.click(getByLabelText("Circulate"))
    expect(onTraceKindTap).toHaveBeenLastCalledWith("circulate")
    fireEvent.click(getByLabelText("Trace"))
    fireEvent.click(getByLabelText("Lineart"))
    expect(onTraceKindTap).toHaveBeenLastCalledWith("lineart")
    expect(onTraceKindTap).toHaveBeenCalledTimes(3)
  })

  it("closes the sub-pill when the user clicks outside", () => {
    const { getByLabelText, queryByLabelText } = render(
      <div>
        <EditorTopLeftBar />
        <button type="button" aria-label="outside">outside</button>
      </div>,
    )
    fireEvent.click(getByLabelText("Trace"))
    expect(getByLabelText("Pixelate")).not.toBeNull()
    fireEvent.pointerDown(getByLabelText("outside"))
    expect(queryByLabelText("Pixelate")).toBeNull()
  })

  it("renders Home and section group as two separate pill containers", () => {
    const { container } = render(<EditorTopLeftBar />)
    const pills = container.querySelectorAll(":scope > div > div")
    expect(pills.length).toBe(2)
  })
})
