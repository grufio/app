/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
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

  it("invokes onSectionTap for Image / Filter / Color and for Trace (which also shows current state)", () => {
    const onSectionTap = vi.fn()
    const { getByLabelText } = render(<EditorTopLeftBar onSectionTap={onSectionTap} />)
    fireEvent.click(getByLabelText("Image"))
    expect(onSectionTap).toHaveBeenLastCalledWith("artboard")
    fireEvent.click(getByLabelText("Filter"))
    expect(onSectionTap).toHaveBeenLastCalledWith("filter")
    fireEvent.click(getByLabelText("Color"))
    expect(onSectionTap).toHaveBeenLastCalledWith("colors")
    expect(onSectionTap).toHaveBeenCalledTimes(3)
    // The Trace icon only navigates to the trace section (show current
    // trace state); the kind menu is driven by the separate + circle.
    fireEvent.click(getByLabelText("Trace"))
    expect(onSectionTap).toHaveBeenLastCalledWith("trace")
    expect(onSectionTap).toHaveBeenCalledTimes(4)
  })

  it("renders an always-present Add-trace + circle that the Trace icon does not control", () => {
    const onSectionTap = vi.fn()
    const { getByLabelText, queryByLabelText } = render(
      <EditorTopLeftBar onSectionTap={onSectionTap} />,
    )
    // The + circle is shown regardless of the active section.
    expect(getByLabelText("Add trace")).not.toBeNull()
    // Tapping Trace navigates but does NOT open the kind menu.
    fireEvent.click(getByLabelText("Trace"))
    expect(onSectionTap).toHaveBeenLastCalledWith("trace")
    expect(queryByLabelText("Pixelate")).toBeNull()
  })

  it("marks only the active section as aria-pressed", () => {
    const { getByLabelText } = render(<EditorTopLeftBar activeSection="filter" />)
    expect(getByLabelText("Filter").getAttribute("aria-pressed")).toBe("true")
    expect(getByLabelText("Image").getAttribute("aria-pressed")).not.toBe("true")
    expect(getByLabelText("Trace").getAttribute("aria-pressed")).not.toBe("true")
    expect(getByLabelText("Color").getAttribute("aria-pressed")).not.toBe("true")
  })

  it("marks Trace active when the trace section is the active section", () => {
    const { getByLabelText } = render(<EditorTopLeftBar activeSection="trace" />)
    expect(getByLabelText("Trace").getAttribute("aria-pressed")).toBe("true")
  })

  it("toggles the kind menu via the + circle with all three kinds when no trace is set", () => {
    const { getByLabelText, queryByLabelText } = render(<EditorTopLeftBar />)
    expect(queryByLabelText("Pixelate")).toBeNull()
    expect(queryByLabelText("Circulate")).toBeNull()
    expect(queryByLabelText("Lineart")).toBeNull()
    fireEvent.click(getByLabelText("Add trace"))
    expect(getByLabelText("Pixelate")).not.toBeNull()
    expect(getByLabelText("Circulate")).not.toBeNull()
    expect(getByLabelText("Lineart")).not.toBeNull()
    // The circle is now the close affordance and reports expanded.
    expect(getByLabelText("Close trace menu").getAttribute("aria-expanded")).toBe("true")
    fireEvent.click(getByLabelText("Close trace menu"))
    expect(queryByLabelText("Pixelate")).toBeNull()
  })

  it("rotates the + into an × (rotate-45) while the menu is open", () => {
    const { getByLabelText } = render(<EditorTopLeftBar />)
    const closedIcon = getByLabelText("Add trace").querySelector("svg")
    expect(closedIcon?.classList.contains("rotate-45")).toBe(false)
    fireEvent.click(getByLabelText("Add trace"))
    const openIcon = getByLabelText("Close trace menu").querySelector("svg")
    expect(openIcon?.classList.contains("rotate-45")).toBe(true)
  })

  it("shows only the active trace kind in the menu once one is set", () => {
    const { getByLabelText, queryByLabelText } = render(
      <EditorTopLeftBar activeTraceKind="circulate" />,
    )
    fireEvent.click(getByLabelText("Add trace"))
    // Trace is mutually exclusive — only the active kind is offered.
    expect(getByLabelText("Circulate")).not.toBeNull()
    expect(queryByLabelText("Pixelate")).toBeNull()
    expect(queryByLabelText("Lineart")).toBeNull()
  })

  it("shows a Delete-trace circle next to the active kind and clears the trace", async () => {
    const onDeleteTrace = vi.fn()
    const { getByLabelText, queryByLabelText } = render(
      <EditorTopLeftBar activeTraceKind="circulate" onDeleteTrace={onDeleteTrace} />,
    )
    // No delete affordance until the menu is opened.
    expect(queryByLabelText("Delete trace")).toBeNull()
    fireEvent.click(getByLabelText("Add trace"))
    const del = getByLabelText("Delete trace")
    expect(del).not.toBeNull()
    fireEvent.click(del)
    expect(onDeleteTrace).toHaveBeenCalledTimes(1)
    // The clear is async — the menu closes once it resolves.
    await waitFor(() => {
      expect(queryByLabelText("Circulate")).toBeNull()
    })
  })

  it("spins the Delete circle (disabled) while the clear is in flight", async () => {
    let resolveDelete: () => void = () => {}
    const onDeleteTrace = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve
        }),
    )
    const { getByLabelText, queryByLabelText } = render(
      <EditorTopLeftBar activeTraceKind="pixelate" onDeleteTrace={onDeleteTrace} />,
    )
    fireEvent.click(getByLabelText("Add trace"))
    const del = getByLabelText("Delete trace") as HTMLButtonElement
    fireEvent.click(del)

    // In flight: spinner shown + button disabled.
    await waitFor(() => {
      expect(del.querySelector(".animate-spin")).not.toBeNull()
    })
    expect(del.disabled).toBe(true)

    // Resolve → the menu closes (Delete circle leaves the DOM).
    resolveDelete()
    await waitFor(() => {
      expect(queryByLabelText("Delete trace")).toBeNull()
    })
  })

  it("does not show the Delete-trace circle in the no-trace 3-kind picker", () => {
    const { getByLabelText, queryByLabelText } = render(<EditorTopLeftBar />)
    fireEvent.click(getByLabelText("Add trace"))
    expect(queryByLabelText("Delete trace")).toBeNull()
  })

  it("re-opens the active kind's dialog when its menu icon is tapped", () => {
    const onTraceKindTap = vi.fn()
    const { getByLabelText, queryByLabelText } = render(
      <EditorTopLeftBar activeTraceKind="lineart" onTraceKindTap={onTraceKindTap} />,
    )
    fireEvent.click(getByLabelText("Add trace"))
    fireEvent.click(getByLabelText("Lineart"))
    expect(onTraceKindTap).toHaveBeenLastCalledWith("lineart")
    expect(queryByLabelText("Lineart")).toBeNull()
  })

  it("invokes onTraceKindTap with the picked kind and closes the menu when no trace is set", () => {
    const onTraceKindTap = vi.fn()
    const { getByLabelText, queryByLabelText } = render(
      <EditorTopLeftBar onTraceKindTap={onTraceKindTap} />,
    )
    fireEvent.click(getByLabelText("Add trace"))
    fireEvent.click(getByLabelText("Pixelate"))
    expect(onTraceKindTap).toHaveBeenLastCalledWith("pixelate")
    expect(queryByLabelText("Pixelate")).toBeNull()
    fireEvent.click(getByLabelText("Add trace"))
    fireEvent.click(getByLabelText("Circulate"))
    expect(onTraceKindTap).toHaveBeenLastCalledWith("circulate")
    fireEvent.click(getByLabelText("Add trace"))
    fireEvent.click(getByLabelText("Lineart"))
    expect(onTraceKindTap).toHaveBeenLastCalledWith("lineart")
    expect(onTraceKindTap).toHaveBeenCalledTimes(3)
  })

  it("closes the kind menu when the user clicks outside", () => {
    const { getByLabelText, queryByLabelText } = render(
      <div>
        <EditorTopLeftBar />
        <button type="button" aria-label="outside">outside</button>
      </div>,
    )
    fireEvent.click(getByLabelText("Add trace"))
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
