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
    return render(
      <EditorNav
        activeSection={activeSection}
        onSelectSection={onSelectSection}
        theme={{ value: "dark", onToggle: () => {} }}
      />,
    )
  }

  it("renders Home + the four section buttons with their labels", () => {
    const { getByLabelText } = renderNav()
    expect(getByLabelText("Home")).not.toBeNull()
    for (const label of ["Image", "Filter", "Trace", "Color"]) {
      expect(getByLabelText(label)).not.toBeNull()
    }
  })

  it("renders Home as a link to /dashboard", () => {
    const { getByLabelText } = renderNav()
    const home = getByLabelText("Home") as HTMLAnchorElement
    expect(home.tagName).toBe("A")
    expect(home.getAttribute("href")).toBe("/dashboard")
  })

  it("invokes onSelectSection with the matching section key (pure navigation, no menus)", () => {
    const onSelectSection = vi.fn()
    const { getByLabelText, queryByLabelText } = renderNav("artboard", onSelectSection)
    fireEvent.click(getByLabelText("Image"))
    expect(onSelectSection).toHaveBeenLastCalledWith("artboard")
    fireEvent.click(getByLabelText("Filter"))
    expect(onSelectSection).toHaveBeenLastCalledWith("filter")
    fireEvent.click(getByLabelText("Trace"))
    expect(onSelectSection).toHaveBeenLastCalledWith("trace")
    fireEvent.click(getByLabelText("Color"))
    expect(onSelectSection).toHaveBeenLastCalledWith("colors")
    expect(onSelectSection).toHaveBeenCalledTimes(4)
    expect(queryByLabelText("Add trace")).toBeNull()
  })

  it("marks only the active section as aria-pressed", () => {
    const { getByLabelText } = renderNav("filter")
    expect(getByLabelText("Filter").getAttribute("aria-pressed")).toBe("true")
    expect(getByLabelText("Image").getAttribute("aria-pressed")).not.toBe("true")
    expect(getByLabelText("Trace").getAttribute("aria-pressed")).not.toBe("true")
    expect(getByLabelText("Color").getAttribute("aria-pressed")).not.toBe("true")
  })

  it("renders the dark/light toggle and fires onToggle", () => {
    const onToggle = vi.fn()
    const { getByLabelText, rerender } = render(
      <EditorNav activeSection="artboard" onSelectSection={() => {}} theme={{ value: "dark", onToggle }} />,
    )
    fireEvent.click(getByLabelText("Switch to light theme"))
    expect(onToggle).toHaveBeenCalledTimes(1)
    rerender(
      <EditorNav activeSection="artboard" onSelectSection={() => {}} theme={{ value: "light", onToggle }} />,
    )
    expect(getByLabelText("Switch to dark theme")).not.toBeNull()
  })
})
