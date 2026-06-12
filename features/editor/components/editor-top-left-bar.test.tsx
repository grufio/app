/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react"
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

  it("shows the Add-trace + circle only while the Trace section is active", () => {
    const { getByLabelText, queryByLabelText, rerender } = render(
      <EditorTopLeftBar activeSection="filter" />,
    )
    // Off the Trace section → no + circle.
    expect(queryByLabelText("Add trace")).toBeNull()
    // On the Trace section → the + circle appears (but the menu is still closed).
    rerender(<EditorTopLeftBar activeSection="trace" />)
    expect(getByLabelText("Add trace")).not.toBeNull()
    expect(queryByLabelText("Pixelate")).toBeNull()
  })

  it("collapses the kind menu when navigating away from the Trace section", () => {
    const { getByLabelText, queryByLabelText, rerender } = render(
      <EditorTopLeftBar activeSection="trace" />,
    )
    fireEvent.click(getByLabelText("Add trace"))
    expect(getByLabelText("Pixelate")).not.toBeNull()
    // Leave Trace → the whole + stack (and its menu) is gone.
    rerender(<EditorTopLeftBar activeSection="colors" />)
    expect(queryByLabelText("Add trace")).toBeNull()
    expect(queryByLabelText("Pixelate")).toBeNull()
    // Return to Trace → the + is back and CLOSED (menu did not persist).
    rerender(<EditorTopLeftBar activeSection="trace" />)
    expect(getByLabelText("Add trace")).not.toBeNull()
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
    const { getByLabelText, queryByLabelText } = render(<EditorTopLeftBar activeSection="trace" />)
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

  it("swaps the ellipsis trigger for an × while the menu is open", () => {
    const { getByLabelText } = render(<EditorTopLeftBar activeSection="trace" />)
    // Closed: ellipsis glyph on the "Add" trigger, no ×.
    expect(getByLabelText("Add trace").querySelector(".lucide-ellipsis")).not.toBeNull()
    expect(getByLabelText("Add trace").querySelector(".lucide-x")).toBeNull()
    fireEvent.click(getByLabelText("Add trace"))
    // Open: × glyph on the "Close" trigger, no ellipsis.
    expect(getByLabelText("Close trace menu").querySelector(".lucide-x")).not.toBeNull()
    expect(getByLabelText("Close trace menu").querySelector(".lucide-ellipsis")).toBeNull()
  })

  it("shows all three kinds once one is set: active highlighted, other two disabled", () => {
    const { getByLabelText } = render(
      <EditorTopLeftBar activeSection="trace" activeTraceKind="circulate" />,
    )
    fireEvent.click(getByLabelText("Add trace"))
    // All three are present (individual circles), not just the active one.
    expect(getByLabelText("Pixelate")).not.toBeNull()
    expect(getByLabelText("Circulate")).not.toBeNull()
    expect(getByLabelText("Lineart")).not.toBeNull()
    // The two non-active kinds are disabled buttons; switching needs delete-first.
    expect((getByLabelText("Pixelate") as HTMLButtonElement).disabled).toBe(true)
    expect((getByLabelText("Lineart") as HTMLButtonElement).disabled).toBe(true)
    // The active kind is a non-interactive indicator (a div, not a button).
    expect(getByLabelText("Circulate").tagName).not.toBe("BUTTON")
  })

  it("does not invoke onTraceKindTap when a disabled non-active kind is clicked", () => {
    const onTraceKindTap = vi.fn()
    const { getByLabelText } = render(
      <EditorTopLeftBar
        activeSection="trace"
        activeTraceKind="circulate"
        onTraceKindTap={onTraceKindTap}
      />,
    )
    fireEvent.click(getByLabelText("Add trace"))
    fireEvent.click(getByLabelText("Pixelate"))
    fireEvent.click(getByLabelText("Lineart"))
    expect(onTraceKindTap).not.toHaveBeenCalled()
  })

  it("shows a Delete-trace circle next to the active kind and clears the trace", async () => {
    const onDeleteTrace = vi.fn()
    const { getByLabelText, queryByLabelText } = render(
      <EditorTopLeftBar
        activeSection="trace"
        activeTraceKind="circulate"
        onDeleteTrace={onDeleteTrace}
      />,
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
      <EditorTopLeftBar
        activeSection="trace"
        activeTraceKind="pixelate"
        onDeleteTrace={onDeleteTrace}
      />,
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
    const { getByLabelText, queryByLabelText } = render(<EditorTopLeftBar activeSection="trace" />)
    fireEvent.click(getByLabelText("Add trace"))
    expect(queryByLabelText("Delete trace")).toBeNull()
  })

  it("re-opens the active kind's dialog via the Edit circle", () => {
    const onTraceKindTap = vi.fn()
    const { getByLabelText, queryByLabelText } = render(
      <EditorTopLeftBar
        activeSection="trace"
        activeTraceKind="lineart"
        onTraceKindTap={onTraceKindTap}
      />,
    )
    fireEvent.click(getByLabelText("Add trace"))
    // The active glyph itself is a non-interactive indicator now; editing is
    // driven by the Edit (pencil) circle.
    fireEvent.click(getByLabelText("Edit trace"))
    expect(onTraceKindTap).toHaveBeenLastCalledWith("lineart")
    expect(queryByLabelText("Edit trace")).toBeNull()
  })

  it("keeps the other two kinds visible + disabled while a delete is in flight", async () => {
    let resolveDelete: () => void = () => {}
    const onDeleteTrace = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve
        }),
    )
    const { getByLabelText } = render(
      <EditorTopLeftBar
        activeSection="trace"
        activeTraceKind="circulate"
        onDeleteTrace={onDeleteTrace}
      />,
    )
    fireEvent.click(getByLabelText("Add trace"))
    fireEvent.click(getByLabelText("Delete trace"))
    // In flight: the active kind keeps spinning on Delete, and the other two
    // kinds stay on screen, disabled.
    await waitFor(() => {
      expect(getByLabelText("Delete trace").querySelector(".animate-spin")).not.toBeNull()
    })
    expect((getByLabelText("Pixelate") as HTMLButtonElement).disabled).toBe(true)
    expect((getByLabelText("Lineart") as HTMLButtonElement).disabled).toBe(true)
    resolveDelete()
  })

  it("invokes onTraceKindTap with the picked kind and closes the menu when no trace is set", () => {
    const onTraceKindTap = vi.fn()
    const { getByLabelText, queryByLabelText } = render(
      <EditorTopLeftBar activeSection="trace" onTraceKindTap={onTraceKindTap} />,
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
        <EditorTopLeftBar activeSection="trace" />
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

  // ── Filter "+" menu (parallel, instant apply, unlock-when-locked) ──────────

  it("shows the Add-filter + circle only while the Filter section is active", () => {
    const { getByLabelText, queryByLabelText, rerender } = render(
      <EditorTopLeftBar activeSection="trace" />,
    )
    expect(queryByLabelText("Add filter")).toBeNull()
    rerender(<EditorTopLeftBar activeSection="filter" />)
    expect(getByLabelText("Add filter")).not.toBeNull()
    expect(queryByLabelText("B&W Hard")).toBeNull()
  })

  it("applies a filter on tap and keeps the menu open (parallel stacking)", () => {
    const onApplyFilterKind = vi.fn()
    const { getByLabelText } = render(
      <EditorTopLeftBar activeSection="filter" onApplyFilterKind={onApplyFilterKind} />,
    )
    fireEvent.click(getByLabelText("Add filter"))
    fireEvent.click(getByLabelText("B&W Hard"))
    expect(onApplyFilterKind).toHaveBeenLastCalledWith("bw_hard")
    // Menu stays open — the other kinds are still on screen.
    expect(getByLabelText("B&W Soft")).not.toBeNull()
    expect(getByLabelText("B&W Warm")).not.toBeNull()
  })

  it("leaves non-active kinds selectable while another is active (parallel)", () => {
    const onApplyFilterKind = vi.fn()
    const { getByLabelText } = render(
      <EditorTopLeftBar
        activeSection="filter"
        activeFilterByKind={{ bw_hard: "f1" }}
        onApplyFilterKind={onApplyFilterKind}
      />,
    )
    fireEvent.click(getByLabelText("Add filter"))
    // The active kind is a non-button indicator; the others stay enabled.
    expect(getByLabelText("B&W Hard").tagName).not.toBe("BUTTON")
    expect((getByLabelText("B&W Soft") as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(getByLabelText("B&W Warm"))
    expect(onApplyFilterKind).toHaveBeenLastCalledWith("bw_warm")
  })

  it("shows a Delete circle per active kind and removes that instance", async () => {
    const onRemoveFilter = vi.fn()
    const { getByLabelText, getAllByLabelText } = render(
      <EditorTopLeftBar
        activeSection="filter"
        activeFilterByKind={{ bw_hard: "f1", bw_warm: "f3" }}
        onRemoveFilter={onRemoveFilter}
      />,
    )
    fireEvent.click(getByLabelText("Add filter"))
    // Two active kinds → two Delete circles.
    expect(getAllByLabelText("Delete filter")).toHaveLength(2)
    // No Unlock when not locked.
    expect(getByLabelText("B&W Hard")).not.toBeNull()
    fireEvent.click(getAllByLabelText("Delete filter")[0])
    expect(onRemoveFilter).toHaveBeenLastCalledWith("f1")
  })

  it("spins the filter Delete circle while removal is in flight and stays open", async () => {
    let resolveDelete: () => void = () => {}
    const onRemoveFilter = vi.fn(
      () => new Promise<void>((resolve) => { resolveDelete = resolve }),
    )
    const { getByLabelText } = render(
      <EditorTopLeftBar
        activeSection="filter"
        activeFilterByKind={{ bw_hard: "f1" }}
        onRemoveFilter={onRemoveFilter}
      />,
    )
    fireEvent.click(getByLabelText("Add filter"))
    const del = getByLabelText("Delete filter") as HTMLButtonElement
    fireEvent.click(del)
    await waitFor(() => {
      expect(del.querySelector(".animate-spin")).not.toBeNull()
    })
    expect(del.disabled).toBe(true)
    resolveDelete()
    // Filter menu stays open after delete (unlike trace) — the + is still there.
    await waitFor(() => {
      expect(getByLabelText("B&W Soft")).not.toBeNull()
    })
  })

  it("does not render an Edit affordance on filter rows", () => {
    const { getByLabelText, queryByLabelText } = render(
      <EditorTopLeftBar activeSection="filter" activeFilterByKind={{ bw_hard: "f1" }} />,
    )
    fireEvent.click(getByLabelText("Add filter"))
    expect(queryByLabelText("Edit filter")).toBeNull()
    expect(queryByLabelText("Edit trace")).toBeNull()
  })

  it("when locked: shows Unlock, hides Delete, disables applies", () => {
    const onUnlockFilter = vi.fn()
    const onApplyFilterKind = vi.fn()
    const { getByLabelText, queryByLabelText } = render(
      <EditorTopLeftBar
        activeSection="filter"
        activeFilterByKind={{ bw_hard: "f1" }}
        filterLocked
        onUnlockFilter={onUnlockFilter}
        onApplyFilterKind={onApplyFilterKind}
      />,
    )
    fireEvent.click(getByLabelText("Add filter"))
    // Unlock replaces Delete on the active row.
    expect(getByLabelText("Unlock filters")).not.toBeNull()
    expect(queryByLabelText("Delete filter")).toBeNull()
    fireEvent.click(getByLabelText("Unlock filters"))
    expect(onUnlockFilter).toHaveBeenCalledTimes(1)
    // Non-active kinds are disabled (can't apply while locked).
    expect((getByLabelText("B&W Soft") as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(getByLabelText("B&W Soft"))
    expect(onApplyFilterKind).not.toHaveBeenCalled()
  })

  it("disables filter applies when add is disabled", () => {
    const onApplyFilterKind = vi.fn()
    const { getByLabelText } = render(
      <EditorTopLeftBar
        activeSection="filter"
        isAddFilterDisabled
        onApplyFilterKind={onApplyFilterKind}
      />,
    )
    fireEvent.click(getByLabelText("Add filter"))
    expect((getByLabelText("B&W Hard") as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(getByLabelText("B&W Hard"))
    expect(onApplyFilterKind).not.toHaveBeenCalled()
  })

  it("closes the filter menu when the user clicks outside", () => {
    const { getByLabelText, queryByLabelText } = render(
      <div>
        <EditorTopLeftBar activeSection="filter" />
        <button type="button" aria-label="outside">outside</button>
      </div>,
    )
    fireEvent.click(getByLabelText("Add filter"))
    expect(getByLabelText("B&W Hard")).not.toBeNull()
    fireEvent.pointerDown(getByLabelText("outside"))
    expect(queryByLabelText("B&W Hard")).toBeNull()
  })

  // ── Artboard / Image "+" menu (launcher + glanceable state, image-lock aware) ──

  it("shows the Add-to-artboard + circle only while the artboard section is active", () => {
    const { getByLabelText, queryByLabelText, rerender } = render(
      <EditorTopLeftBar activeSection="filter" />,
    )
    expect(queryByLabelText("Add to artboard")).toBeNull()
    rerender(<EditorTopLeftBar activeSection="artboard" />)
    expect(getByLabelText("Add to artboard")).not.toBeNull()
    expect(queryByLabelText("Artboard/Page")).toBeNull()
  })

  it("opens the artboard sheet from the Artboard/Page Edit lead", () => {
    const onOpenArtboard = vi.fn()
    const { getByLabelText } = render(
      <EditorTopLeftBar activeSection="artboard" onOpenArtboard={onOpenArtboard} />,
    )
    fireEvent.click(getByLabelText("Add to artboard"))
    // Artboard/Page is an always-active indicator (non-button) with an Edit lead.
    expect(getByLabelText("Artboard/Page").tagName).not.toBe("BUTTON")
    fireEvent.click(getByLabelText("Edit artboard"))
    expect(onOpenArtboard).toHaveBeenCalledTimes(1)
    expect(onOpenArtboard).toHaveBeenCalledWith("artboard")
  })

  it("quick-creates a grid when none exists and keeps the menu open", () => {
    const onCreateGrid = vi.fn()
    const { getByLabelText } = render(
      <EditorTopLeftBar activeSection="artboard" onCreateGrid={onCreateGrid} />,
    )
    fireEvent.click(getByLabelText("Add to artboard"))
    fireEvent.click(getByLabelText("Grid"))
    expect(onCreateGrid).toHaveBeenCalledTimes(1)
    // Menu stays open after create (Artboard/Page is unique to the open menu).
    expect(getByLabelText("Artboard/Page")).not.toBeNull()
  })

  it("shows the Grid Edit lead when a grid exists", () => {
    const onOpenArtboard = vi.fn()
    const { getByLabelText } = render(
      <EditorTopLeftBar activeSection="artboard" hasGrid onOpenArtboard={onOpenArtboard} />,
    )
    fireEvent.click(getByLabelText("Add to artboard"))
    expect(getByLabelText("Grid").tagName).not.toBe("BUTTON")
    fireEvent.click(getByLabelText("Edit grid"))
    expect(onOpenArtboard).toHaveBeenCalledTimes(1)
    expect(onOpenArtboard).toHaveBeenCalledWith("grid")
  })

  it("opens the sheet to upload when no image exists, and shows Edit when it does", () => {
    // "Image" collides with the artboard section-nav label, so scope frame
    // queries to the open menu (the + button's container).
    const onOpenArtboard = vi.fn()
    const { getByLabelText, rerender } = render(
      <EditorTopLeftBar activeSection="artboard" onOpenArtboard={onOpenArtboard} />,
    )
    fireEvent.click(getByLabelText("Add to artboard"))
    const menu = within(getByLabelText("Close artboard menu").parentElement!)
    // No image → the Image frame is a selectable button → opens the sheet (and
    // the launcher collapses the menu).
    fireEvent.click(menu.getByLabelText("Image"))
    expect(onOpenArtboard).toHaveBeenCalledTimes(1)
    expect(onOpenArtboard).toHaveBeenCalledWith("image")
    // Re-open with an image present → the Image frame is now an indicator + Edit.
    rerender(<EditorTopLeftBar activeSection="artboard" hasMasterImage onOpenArtboard={onOpenArtboard} />)
    fireEvent.click(getByLabelText("Add to artboard"))
    const menu2 = within(getByLabelText("Close artboard menu").parentElement!)
    expect(menu2.getByLabelText("Image").tagName).not.toBe("BUTTON")
    expect(getByLabelText("Edit image")).not.toBeNull()
  })

  it("when image-locked: Artboard/Page + Image show Unlock, Grid is exempt", () => {
    const onUnlockImage = vi.fn()
    const onOpenArtboard = vi.fn()
    const { getByLabelText, queryByLabelText, getAllByLabelText } = render(
      <EditorTopLeftBar
        activeSection="artboard"
        hasGrid
        hasMasterImage
        imageLocked
        onUnlockImage={onUnlockImage}
        onOpenArtboard={onOpenArtboard}
      />,
    )
    fireEvent.click(getByLabelText("Add to artboard"))
    // Page + Image swap Edit → Unlock.
    expect(getAllByLabelText("Unlock image")).toHaveLength(2)
    expect(queryByLabelText("Edit artboard")).toBeNull()
    expect(queryByLabelText("Edit image")).toBeNull()
    fireEvent.click(getAllByLabelText("Unlock image")[0])
    expect(onUnlockImage).toHaveBeenCalledTimes(1)
    // Grid is untouched by the lock — still its Edit lead.
    expect(getByLabelText("Edit grid")).not.toBeNull()
    fireEvent.click(getByLabelText("Edit grid"))
    expect(onOpenArtboard).toHaveBeenCalledTimes(1)
  })

  it("disables the Unlock leads while the image unlock is busy", () => {
    const { getByLabelText, getAllByLabelText } = render(
      <EditorTopLeftBar
        activeSection="artboard"
        hasMasterImage
        imageLocked
        unlockImageBusy
      />,
    )
    fireEvent.click(getByLabelText("Add to artboard"))
    for (const btn of getAllByLabelText("Unlock image")) {
      expect((btn as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it("closes the artboard menu when the user clicks outside", () => {
    const { getByLabelText, queryByLabelText } = render(
      <div>
        <EditorTopLeftBar activeSection="artboard" />
        <button type="button" aria-label="outside">outside</button>
      </div>,
    )
    fireEvent.click(getByLabelText("Add to artboard"))
    expect(getByLabelText("Artboard/Page")).not.toBeNull()
    fireEvent.pointerDown(getByLabelText("outside"))
    expect(queryByLabelText("Artboard/Page")).toBeNull()
  })

  // ── Locked-section dim + filter-apply spinner ──

  it("dims the Filter + Image icons while locked but keeps them tappable", () => {
    const onSectionTap = vi.fn()
    const { getByLabelText } = render(
      <EditorTopLeftBar activeSection="trace" filterLocked imageLocked onSectionTap={onSectionTap} />,
    )
    const filterIcon = getByLabelText("Filter")
    const imageIcon = getByLabelText("Image")
    expect(filterIcon.className).toContain("opacity-40")
    expect(imageIcon.className).toContain("opacity-40")
    // Still navigable (unlock lives inside the section's "+" menu).
    fireEvent.click(filterIcon)
    fireEvent.click(imageIcon)
    expect(onSectionTap).toHaveBeenCalledWith("filter")
    expect(onSectionTap).toHaveBeenCalledWith("artboard")
  })

  it("does not dim Filter/Image when unlocked", () => {
    const { getByLabelText } = render(<EditorTopLeftBar activeSection="trace" />)
    expect(getByLabelText("Filter").className).not.toContain("opacity-40")
    expect(getByLabelText("Image").className).not.toContain("opacity-40")
  })

  it("spins the Filter icon while a filter is applying", () => {
    const { getByLabelText, rerender } = render(<EditorTopLeftBar activeSection="filter" />)
    expect(getByLabelText("Filter").querySelector(".animate-spin")).toBeNull()
    rerender(<EditorTopLeftBar activeSection="filter" isApplyingFilter />)
    expect(getByLabelText("Filter").querySelector(".animate-spin")).not.toBeNull()
  })
})
