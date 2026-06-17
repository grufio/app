/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EditorTopBar } from "./editor-top-bar"

describe("EditorTopBar", () => {
  afterEach(() => {
    cleanup()
  })

  // ── Trace "+" menu (mutually exclusive, edit + delete on the active row) ──

  it("shows the Add-trace + circle only while the Trace section is active", () => {
    const { getByLabelText, queryByLabelText, rerender } = render(
      <EditorTopBar activeSection="filter" />,
    )
    expect(queryByLabelText("Add trace")).toBeNull()
    rerender(<EditorTopBar activeSection="trace" />)
    expect(getByLabelText("Add trace")).not.toBeNull()
    expect(queryByLabelText("Pixelate")).toBeNull()
  })

  it("collapses the kind menu when navigating away from the Trace section", () => {
    const { getByLabelText, queryByLabelText, rerender } = render(
      <EditorTopBar activeSection="trace" />,
    )
    fireEvent.click(getByLabelText("Add trace"))
    expect(getByLabelText("Pixelate")).not.toBeNull()
    // Leave Trace → the whole + stack (and its menu) is gone (Colors has none).
    rerender(<EditorTopBar activeSection="colors" />)
    expect(queryByLabelText("Add trace")).toBeNull()
    expect(queryByLabelText("Pixelate")).toBeNull()
    // Return to Trace → the + is back and CLOSED (menu did not persist).
    rerender(<EditorTopBar activeSection="trace" />)
    expect(getByLabelText("Add trace")).not.toBeNull()
    expect(queryByLabelText("Pixelate")).toBeNull()
  })

  it("toggles the kind menu via the + circle with all three kinds when no trace is set", () => {
    const { getByLabelText, queryByLabelText } = render(<EditorTopBar activeSection="trace" />)
    expect(queryByLabelText("Pixelate")).toBeNull()
    fireEvent.click(getByLabelText("Add trace"))
    expect(getByLabelText("Pixelate")).not.toBeNull()
    expect(getByLabelText("Circulate")).not.toBeNull()
    expect(getByLabelText("Lineart")).not.toBeNull()
    expect(getByLabelText("Close trace menu").getAttribute("aria-expanded")).toBe("true")
    fireEvent.click(getByLabelText("Close trace menu"))
    expect(queryByLabelText("Pixelate")).toBeNull()
  })

  it("shows all three kinds once one is set: active highlighted, other two disabled", () => {
    const { getByLabelText } = render(
      <EditorTopBar activeSection="trace" activeTraceKind="circulate" />,
    )
    fireEvent.click(getByLabelText("Add trace"))
    expect((getByLabelText("Pixelate") as HTMLButtonElement).disabled).toBe(true)
    expect((getByLabelText("Lineart") as HTMLButtonElement).disabled).toBe(true)
    // The active kind is a non-interactive indicator (a div, not a button).
    expect(getByLabelText("Circulate").tagName).not.toBe("BUTTON")
  })

  it("does not invoke onTraceKindTap when a disabled non-active kind is clicked", () => {
    const onTraceKindTap = vi.fn()
    const { getByLabelText } = render(
      <EditorTopBar activeSection="trace" activeTraceKind="circulate" onTraceKindTap={onTraceKindTap} />,
    )
    fireEvent.click(getByLabelText("Add trace"))
    fireEvent.click(getByLabelText("Pixelate"))
    fireEvent.click(getByLabelText("Lineart"))
    expect(onTraceKindTap).not.toHaveBeenCalled()
  })

  it("shows a Delete-trace circle next to the active kind and clears the trace", async () => {
    const onDeleteTrace = vi.fn()
    const { getByLabelText, queryByLabelText } = render(
      <EditorTopBar activeSection="trace" activeTraceKind="circulate" onDeleteTrace={onDeleteTrace} />,
    )
    expect(queryByLabelText("Delete trace")).toBeNull()
    fireEvent.click(getByLabelText("Add trace"))
    fireEvent.click(getByLabelText("Delete trace"))
    expect(onDeleteTrace).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(queryByLabelText("Circulate")).toBeNull()
    })
  })

  it("re-opens the active kind's dialog via the Edit circle", () => {
    const onTraceKindTap = vi.fn()
    const { getByLabelText, queryByLabelText } = render(
      <EditorTopBar activeSection="trace" activeTraceKind="lineart" onTraceKindTap={onTraceKindTap} />,
    )
    fireEvent.click(getByLabelText("Add trace"))
    fireEvent.click(getByLabelText("Edit trace"))
    expect(onTraceKindTap).toHaveBeenLastCalledWith("lineart")
    expect(queryByLabelText("Edit trace")).toBeNull()
  })

  it("invokes onTraceKindTap with the picked kind and closes the menu when no trace is set", () => {
    const onTraceKindTap = vi.fn()
    const { getByLabelText, queryByLabelText } = render(
      <EditorTopBar activeSection="trace" onTraceKindTap={onTraceKindTap} />,
    )
    fireEvent.click(getByLabelText("Add trace"))
    fireEvent.click(getByLabelText("Pixelate"))
    expect(onTraceKindTap).toHaveBeenLastCalledWith("pixelate")
    expect(queryByLabelText("Pixelate")).toBeNull()
  })

  it("closes the kind menu when the user clicks outside", () => {
    const { getByLabelText, queryByLabelText } = render(
      <div>
        <EditorTopBar activeSection="trace" />
        <button type="button" aria-label="outside">outside</button>
      </div>,
    )
    fireEvent.click(getByLabelText("Add trace"))
    expect(getByLabelText("Pixelate")).not.toBeNull()
    fireEvent.pointerDown(getByLabelText("outside"))
    expect(queryByLabelText("Pixelate")).toBeNull()
  })

  // ── Filter "+" menu (parallel, instant apply, unlock-when-locked) ──

  it("shows the Add-filter + circle only while the Filter section is active", () => {
    const { getByLabelText, queryByLabelText, rerender } = render(
      <EditorTopBar activeSection="trace" />,
    )
    expect(queryByLabelText("Add filter")).toBeNull()
    rerender(<EditorTopBar activeSection="filter" />)
    expect(getByLabelText("Add filter")).not.toBeNull()
    expect(queryByLabelText("B&W Hard")).toBeNull()
  })

  it("applies a filter on tap and keeps the menu open (parallel stacking)", () => {
    const onApplyFilterKind = vi.fn()
    const { getByLabelText } = render(
      <EditorTopBar activeSection="filter" onApplyFilterKind={onApplyFilterKind} />,
    )
    fireEvent.click(getByLabelText("Add filter"))
    fireEvent.click(getByLabelText("B&W Hard"))
    expect(onApplyFilterKind).toHaveBeenLastCalledWith("bw_hard")
    expect(getByLabelText("B&W Soft")).not.toBeNull()
    expect(getByLabelText("B&W Warm")).not.toBeNull()
  })

  it("shows a Delete circle per active kind and removes that instance", () => {
    const onRemoveFilter = vi.fn()
    const { getByLabelText, getAllByLabelText } = render(
      <EditorTopBar
        activeSection="filter"
        activeFilterByKind={{ bw_hard: "f1", bw_warm: "f3" }}
        onRemoveFilter={onRemoveFilter}
      />,
    )
    fireEvent.click(getByLabelText("Add filter"))
    expect(getAllByLabelText("Delete filter")).toHaveLength(2)
    fireEvent.click(getAllByLabelText("Delete filter")[0])
    expect(onRemoveFilter).toHaveBeenLastCalledWith("f1")
  })

  it("when locked: shows Unlock, hides Delete, disables applies", () => {
    const onUnlockFilter = vi.fn()
    const onApplyFilterKind = vi.fn()
    const { getByLabelText, queryByLabelText } = render(
      <EditorTopBar
        activeSection="filter"
        activeFilterByKind={{ bw_hard: "f1" }}
        filterLocked
        onUnlockFilter={onUnlockFilter}
        onApplyFilterKind={onApplyFilterKind}
      />,
    )
    fireEvent.click(getByLabelText("Add filter"))
    expect(getByLabelText("Unlock filters")).not.toBeNull()
    expect(queryByLabelText("Delete filter")).toBeNull()
    fireEvent.click(getByLabelText("Unlock filters"))
    expect(onUnlockFilter).toHaveBeenCalledTimes(1)
    expect((getByLabelText("B&W Soft") as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(getByLabelText("B&W Soft"))
    expect(onApplyFilterKind).not.toHaveBeenCalled()
  })

  // ── Artboard / Image "+" menu (launchers + glanceable state, lock aware) ──

  it("shows the Add-to-artboard + circle only while the artboard section is active", () => {
    const { getByLabelText, queryByLabelText, rerender } = render(
      <EditorTopBar activeSection="filter" />,
    )
    expect(queryByLabelText("Add to artboard")).toBeNull()
    rerender(<EditorTopBar activeSection="artboard" />)
    expect(getByLabelText("Add to artboard")).not.toBeNull()
    expect(queryByLabelText("Artboard/Page")).toBeNull()
  })

  it("opens the artboard sheet from the Artboard/Page Edit lead", () => {
    const onOpenArtboard = vi.fn()
    const { getByLabelText } = render(
      <EditorTopBar activeSection="artboard" onOpenArtboard={onOpenArtboard} />,
    )
    fireEvent.click(getByLabelText("Add to artboard"))
    expect(getByLabelText("Artboard/Page").tagName).not.toBe("BUTTON")
    fireEvent.click(getByLabelText("Edit artboard"))
    expect(onOpenArtboard).toHaveBeenCalledWith("artboard")
  })

  it("quick-creates a grid when none exists and keeps the menu open", () => {
    const onCreateGrid = vi.fn()
    const { getByLabelText } = render(
      <EditorTopBar activeSection="artboard" onCreateGrid={onCreateGrid} />,
    )
    fireEvent.click(getByLabelText("Add to artboard"))
    fireEvent.click(getByLabelText("Grid"))
    expect(onCreateGrid).toHaveBeenCalledTimes(1)
    expect(getByLabelText("Artboard/Page")).not.toBeNull()
  })

  it("opens the sheet to upload when no image exists (Image frame is selectable)", () => {
    const onOpenArtboard = vi.fn()
    const { getByLabelText } = render(
      <EditorTopBar activeSection="artboard" onOpenArtboard={onOpenArtboard} />,
    )
    fireEvent.click(getByLabelText("Add to artboard"))
    // The decorative context chip carries no accessible name, so "Image" is
    // unambiguously the menu's Image frame.
    fireEvent.click(getByLabelText("Image"))
    expect(onOpenArtboard).toHaveBeenCalledWith("image")
  })

  it("when image-locked: Artboard/Page + Image show Unlock, Grid is exempt", () => {
    const onUnlockImage = vi.fn()
    const onOpenArtboard = vi.fn()
    const { getByLabelText, queryByLabelText, getAllByLabelText } = render(
      <EditorTopBar
        activeSection="artboard"
        hasGrid
        hasMasterImage
        imageLocked
        onUnlockImage={onUnlockImage}
        onOpenArtboard={onOpenArtboard}
      />,
    )
    fireEvent.click(getByLabelText("Add to artboard"))
    expect(getAllByLabelText("Unlock image")).toHaveLength(2)
    expect(queryByLabelText("Edit artboard")).toBeNull()
    expect(queryByLabelText("Edit image")).toBeNull()
    fireEvent.click(getAllByLabelText("Unlock image")[0])
    expect(onUnlockImage).toHaveBeenCalledTimes(1)
    expect(getByLabelText("Edit grid")).not.toBeNull()
  })

  // ── Locked-section dim + filter-apply spinner (context chip) ──

  it("dims the context chip while the active section is locked", () => {
    const { getByTestId, rerender } = render(
      <EditorTopBar activeSection="filter" filterLocked />,
    )
    expect(getByTestId("editor-top-bar-context").className).toContain("opacity-40")
    rerender(<EditorTopBar activeSection="artboard" imageLocked />)
    expect(getByTestId("editor-top-bar-context").className).toContain("opacity-40")
  })

  it("does not dim the context chip when unlocked", () => {
    const { getByTestId } = render(<EditorTopBar activeSection="filter" />)
    expect(getByTestId("editor-top-bar-context").className).not.toContain("opacity-40")
  })

  it("spins the context chip while a filter is applying", () => {
    const { getByTestId, rerender } = render(<EditorTopBar activeSection="filter" />)
    expect(getByTestId("editor-top-bar-context").querySelector(".animate-spin")).toBeNull()
    rerender(<EditorTopBar activeSection="filter" isApplyingFilter />)
    expect(getByTestId("editor-top-bar-context").querySelector(".animate-spin")).not.toBeNull()
  })

  it("renders only the decorative context chip on Colors (no menu)", () => {
    const { getByTestId, queryByLabelText } = render(<EditorTopBar activeSection="colors" />)
    expect(getByTestId("editor-top-bar-context")).not.toBeNull()
    expect(queryByLabelText("Add trace")).toBeNull()
    expect(queryByLabelText("Add filter")).toBeNull()
    expect(queryByLabelText("Add to artboard")).toBeNull()
  })
})
