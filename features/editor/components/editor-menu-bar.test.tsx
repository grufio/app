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

  it("renders the four section buttons with their labels", () => {
    const { getByLabelText } = renderMenu()
    for (const label of ["Image", "Filter", "Trace", "Color"]) {
      expect(getByLabelText(label)).not.toBeNull()
    }
  })

  it("invokes onSelectSection with the matching section key", () => {
    const onSelectSection = vi.fn()
    const { getByLabelText } = renderMenu("artboard", onSelectSection)
    fireEvent.click(getByLabelText("Image"))
    expect(onSelectSection).toHaveBeenLastCalledWith("artboard")
    fireEvent.click(getByLabelText("Filter"))
    expect(onSelectSection).toHaveBeenLastCalledWith("filter")
    fireEvent.click(getByLabelText("Trace"))
    expect(onSelectSection).toHaveBeenLastCalledWith("trace")
    fireEvent.click(getByLabelText("Color"))
    expect(onSelectSection).toHaveBeenLastCalledWith("colors")
    expect(onSelectSection).toHaveBeenCalledTimes(4)
  })

  it("marks only the active section as aria-pressed", () => {
    const { getByLabelText } = renderMenu("filter")
    expect(getByLabelText("Filter").getAttribute("aria-pressed")).toBe("true")
    expect(getByLabelText("Image").getAttribute("aria-pressed")).not.toBe("true")
    expect(getByLabelText("Trace").getAttribute("aria-pressed")).not.toBe("true")
    expect(getByLabelText("Color").getAttribute("aria-pressed")).not.toBe("true")
  })

  it("renders no Image button unless onOpenImage is provided", () => {
    const { queryByLabelText } = renderMenu()
    expect(queryByLabelText("Edit image")).toBeNull()
  })

  it("renders the Image button right after the Artboard icon and fires onOpenImage", () => {
    const onOpenImage = vi.fn()
    const { getByLabelText, container } = render(
      <EditorMenuBar activeSection="artboard" onSelectSection={() => {}} onOpenImage={onOpenImage} hasImage />,
    )
    const btn = getByLabelText("Edit image") as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    fireEvent.click(btn)
    expect(onOpenImage).toHaveBeenCalledOnce()
    // Order: the Image button sits immediately after the Artboard ("Image") section.
    const labels = Array.from(container.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"))
    expect(labels.slice(0, 2)).toEqual(["Image", "Edit image"])
  })

  it("disables the Image button when no master image exists", () => {
    const { getByLabelText } = render(
      <EditorMenuBar activeSection="artboard" onSelectSection={() => {}} onOpenImage={vi.fn()} hasImage={false} />,
    )
    expect((getByLabelText("Edit image") as HTMLButtonElement).disabled).toBe(true)
  })
})
