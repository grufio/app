/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { EditorSection } from "@/lib/editor/editor-sections"
import { EditorMenuBar } from "./editor-menu-bar"

describe("EditorMenuBar", () => {
  afterEach(() => {
    cleanup()
  })

  function renderMenu(
    activeSection: EditorSection = "artboard",
    onSelectSection: (s: EditorSection) => void = () => {},
  ) {
    return render(<EditorMenuBar activeSection={activeSection} onSelectSection={onSelectSection} />)
  }

  it("renders the five section buttons in pipeline order", () => {
    const { getByLabelText, container } = renderMenu()
    for (const label of ["Artboard", "Image", "Filter", "Trace", "Color"]) {
      expect(getByLabelText(label)).not.toBeNull()
    }
    const labels = Array.from(container.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"))
    expect(labels).toEqual(["Artboard", "Image", "Filter", "Trace", "Color"])
  })

  it("invokes onSelectSection with the matching section key", () => {
    const onSelectSection = vi.fn()
    const { getByLabelText } = renderMenu("artboard", onSelectSection)
    fireEvent.click(getByLabelText("Artboard"))
    expect(onSelectSection).toHaveBeenLastCalledWith("artboard")
    fireEvent.click(getByLabelText("Image"))
    expect(onSelectSection).toHaveBeenLastCalledWith("image")
    fireEvent.click(getByLabelText("Filter"))
    expect(onSelectSection).toHaveBeenLastCalledWith("filter")
    fireEvent.click(getByLabelText("Trace"))
    expect(onSelectSection).toHaveBeenLastCalledWith("trace")
    fireEvent.click(getByLabelText("Color"))
    expect(onSelectSection).toHaveBeenLastCalledWith("colors")
    expect(onSelectSection).toHaveBeenCalledTimes(5)
  })

  it("marks only the active section as aria-pressed", () => {
    const { getByLabelText } = renderMenu("image")
    expect(getByLabelText("Image").getAttribute("aria-pressed")).toBe("true")
    for (const label of ["Artboard", "Filter", "Trace", "Color"]) {
      expect(getByLabelText(label).getAttribute("aria-pressed")).not.toBe("true")
    }
  })
})
