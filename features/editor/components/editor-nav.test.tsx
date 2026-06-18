/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { EditorSection } from "@/lib/editor/editor-sections"
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

  function renderNav(
    activeSection: EditorSection = "artboard",
    onSelectSection: (s: EditorSection) => void = () => {},
  ) {
    return render(<EditorNav activeSection={activeSection} onSelectSection={onSelectSection} />)
  }

  it("starts collapsed: Home + an expand handle, section buttons hidden", () => {
    const { getByLabelText, queryByLabelText } = renderNav()
    expect(getByLabelText("Home")).not.toBeNull()
    expect(getByLabelText("Expand navigation")).not.toBeNull()
    expect(queryByLabelText("Image")).toBeNull()
    expect(queryByLabelText("Collapse navigation")).toBeNull()
  })

  it("renders Home as a link to /dashboard", () => {
    const { getByLabelText } = renderNav()
    const home = getByLabelText("Home") as HTMLAnchorElement
    expect(home.tagName).toBe("A")
    expect(home.getAttribute("href")).toBe("/dashboard")
  })

  it("expands to reveal the four sections + a collapse handle, then collapses again", () => {
    const { getByLabelText, queryByLabelText } = renderNav()
    fireEvent.click(getByLabelText("Expand navigation"))
    for (const label of ["Image", "Filter", "Trace", "Color"]) {
      expect(getByLabelText(label)).not.toBeNull()
    }
    expect(getByLabelText("Collapse navigation")).not.toBeNull()
    expect(queryByLabelText("Expand navigation")).toBeNull()
    // Collapse again → sections hidden, expand handle back.
    fireEvent.click(getByLabelText("Collapse navigation"))
    expect(queryByLabelText("Image")).toBeNull()
    expect(getByLabelText("Expand navigation")).not.toBeNull()
  })

  it("invokes onSelectSection with the matching section key (pure navigation, no menus)", () => {
    const onSelectSection = vi.fn()
    const { getByLabelText, queryByLabelText } = renderNav("artboard", onSelectSection)
    fireEvent.click(getByLabelText("Expand navigation"))
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
    const { getByLabelText } = renderNav("filter")
    fireEvent.click(getByLabelText("Expand navigation"))
    expect(getByLabelText("Filter").getAttribute("aria-pressed")).toBe("true")
    expect(getByLabelText("Image").getAttribute("aria-pressed")).not.toBe("true")
    expect(getByLabelText("Trace").getAttribute("aria-pressed")).not.toBe("true")
    expect(getByLabelText("Color").getAttribute("aria-pressed")).not.toBe("true")
  })
})
