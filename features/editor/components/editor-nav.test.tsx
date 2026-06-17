/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EditorNav } from "./editor-nav"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

describe("EditorNav", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders Home + four section buttons with the user-facing labels", () => {
    const { getByLabelText } = render(
      <EditorNav activeSection="artboard" onSelectSection={() => {}} />,
    )
    expect(getByLabelText("Home")).not.toBeNull()
    expect(getByLabelText("Image")).not.toBeNull()
    expect(getByLabelText("Filter")).not.toBeNull()
    expect(getByLabelText("Trace")).not.toBeNull()
    expect(getByLabelText("Color")).not.toBeNull()
  })

  it("renders Home as a link to /dashboard", () => {
    const { getByLabelText } = render(
      <EditorNav activeSection="artboard" onSelectSection={() => {}} />,
    )
    const home = getByLabelText("Home") as HTMLAnchorElement
    expect(home.tagName).toBe("A")
    expect(home.getAttribute("href")).toBe("/dashboard")
  })

  it("invokes onSelectSection with the matching section key (pure navigation, no menus)", () => {
    const onSelectSection = vi.fn()
    const { getByLabelText, queryByLabelText } = render(
      <EditorNav activeSection="artboard" onSelectSection={onSelectSection} />,
    )
    fireEvent.click(getByLabelText("Image"))
    expect(onSelectSection).toHaveBeenLastCalledWith("artboard")
    fireEvent.click(getByLabelText("Filter"))
    expect(onSelectSection).toHaveBeenLastCalledWith("filter")
    fireEvent.click(getByLabelText("Trace"))
    expect(onSelectSection).toHaveBeenLastCalledWith("trace")
    fireEvent.click(getByLabelText("Color"))
    expect(onSelectSection).toHaveBeenLastCalledWith("colors")
    expect(onSelectSection).toHaveBeenCalledTimes(4)
    // No function "+" menus live in the nav.
    expect(queryByLabelText("Add trace")).toBeNull()
    expect(queryByLabelText("Add filter")).toBeNull()
  })

  it("marks only the active section as aria-pressed", () => {
    const { getByLabelText } = render(
      <EditorNav activeSection="filter" onSelectSection={() => {}} />,
    )
    expect(getByLabelText("Filter").getAttribute("aria-pressed")).toBe("true")
    expect(getByLabelText("Image").getAttribute("aria-pressed")).not.toBe("true")
    expect(getByLabelText("Trace").getAttribute("aria-pressed")).not.toBe("true")
    expect(getByLabelText("Color").getAttribute("aria-pressed")).not.toBe("true")
  })

  it("renders Home and the section group as two separate pill containers", () => {
    const { container } = render(
      <EditorNav activeSection="artboard" onSelectSection={() => {}} />,
    )
    const pills = container.querySelectorAll(":scope > div > div")
    expect(pills.length).toBe(2)
  })
})
