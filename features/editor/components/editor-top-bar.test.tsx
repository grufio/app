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

  // ── Always-visible model: no parent icon, no open/close trigger ──

  it("shows the section's frames directly with no parent icon or toggle", () => {
    const { queryByLabelText, getByLabelText } = render(<EditorTopBar activeSection="trace" />)
    // The three trace kinds are visible immediately — no "Add"/"Close" trigger.
    expect(getByLabelText("Pixelate")).not.toBeNull()
    expect(getByLabelText("Circulate")).not.toBeNull()
    expect(getByLabelText("Lineart")).not.toBeNull()
    expect(queryByLabelText("Add trace")).toBeNull()
    expect(queryByLabelText("Close trace menu")).toBeNull()
  })

  it("renders nothing on the Colors section, and swaps frames per active section", () => {
    const { queryByLabelText, getByLabelText, rerender } = render(
      <EditorTopBar activeSection="colors" />,
    )
    expect(queryByLabelText("Pixelate")).toBeNull()
    expect(queryByLabelText("B&W Hard")).toBeNull()
    rerender(<EditorTopBar activeSection="filter" />)
    expect(getByLabelText("B&W Hard")).not.toBeNull()
    expect(queryByLabelText("Pixelate")).toBeNull()
  })

  // ── Trace (mutually exclusive; Edit + Delete on the active row) ──

  it("invokes onTraceKindTap with the picked kind when no trace is set", () => {
    const onTraceKindTap = vi.fn()
    const { getByLabelText } = render(
      <EditorTopBar activeSection="trace" onTraceKindTap={onTraceKindTap} />,
    )
    fireEvent.click(getByLabelText("Pixelate"))
    expect(onTraceKindTap).toHaveBeenLastCalledWith("pixelate")
  })

  it("with an active trace: the active kind is an indicator, the others are disabled", () => {
    const { getByLabelText } = render(
      <EditorTopBar activeSection="trace" activeTraceKind="circulate" />,
    )
    expect((getByLabelText("Pixelate") as HTMLButtonElement).disabled).toBe(true)
    expect((getByLabelText("Lineart") as HTMLButtonElement).disabled).toBe(true)
    expect(getByLabelText("Circulate").tagName).not.toBe("BUTTON")
  })

  it("renders Delete to the LEFT of Edit on the active row, and they fire", () => {
    const onTraceKindTap = vi.fn()
    const onDeleteTrace = vi.fn()
    const { getByLabelText } = render(
      <EditorTopBar
        activeSection="trace"
        activeTraceKind="lineart"
        onTraceKindTap={onTraceKindTap}
        onDeleteTrace={onDeleteTrace}
      />,
    )
    const del = getByLabelText("Delete trace")
    const edit = getByLabelText("Edit trace")
    // Delete comes before Edit in DOM order (Delete left-most, next to Edit).
    expect(del.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(edit)
    expect(onTraceKindTap).toHaveBeenLastCalledWith("lineart")
    fireEvent.click(del)
    expect(onDeleteTrace).toHaveBeenCalledTimes(1)
  })

  it("spins the Delete circle while the clear is in flight", async () => {
    let resolveDelete: () => void = () => {}
    const onDeleteTrace = vi.fn(() => new Promise<void>((r) => { resolveDelete = r }))
    const { getByLabelText } = render(
      <EditorTopBar activeSection="trace" activeTraceKind="pixelate" onDeleteTrace={onDeleteTrace} />,
    )
    const del = getByLabelText("Delete trace") as HTMLButtonElement
    fireEvent.click(del)
    await waitFor(() => {
      expect(del.querySelector(".animate-spin")).not.toBeNull()
    })
    expect(del.disabled).toBe(true)
    resolveDelete()
    await waitFor(() => {
      expect(getByLabelText("Delete trace").querySelector(".animate-spin")).toBeNull()
    })
  })

  // ── Filter (parallel; instant apply; unlock-when-locked) ──

  it("applies a filter on tap; other kinds stay selectable (parallel)", () => {
    const onApplyFilterKind = vi.fn()
    const { getByLabelText } = render(
      <EditorTopBar
        activeSection="filter"
        activeFilterByKind={{ bw_hard: "f1" }}
        onApplyFilterKind={onApplyFilterKind}
      />,
    )
    expect(getByLabelText("B&W Hard").tagName).not.toBe("BUTTON")
    expect((getByLabelText("B&W Soft") as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(getByLabelText("B&W Warm"))
    expect(onApplyFilterKind).toHaveBeenLastCalledWith("bw_warm")
  })

  it("shows a Delete circle per active kind and removes that instance", () => {
    const onRemoveFilter = vi.fn()
    const { getAllByLabelText } = render(
      <EditorTopBar
        activeSection="filter"
        activeFilterByKind={{ bw_hard: "f1", bw_warm: "f3" }}
        onRemoveFilter={onRemoveFilter}
      />,
    )
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
    expect(getByLabelText("Unlock filters")).not.toBeNull()
    expect(queryByLabelText("Delete filter")).toBeNull()
    fireEvent.click(getByLabelText("Unlock filters"))
    expect(onUnlockFilter).toHaveBeenCalledTimes(1)
    expect((getByLabelText("B&W Soft") as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(getByLabelText("B&W Soft"))
    expect(onApplyFilterKind).not.toHaveBeenCalled()
  })

  // ── Artboard / Image (launchers + glanceable state, lock aware) ──

  it("opens the artboard sheet from the Artboard/Page Edit lead", () => {
    const onOpenArtboard = vi.fn()
    const { getByLabelText } = render(
      <EditorTopBar activeSection="artboard" onOpenArtboard={onOpenArtboard} />,
    )
    expect(getByLabelText("Artboard/Page").tagName).not.toBe("BUTTON")
    fireEvent.click(getByLabelText("Edit artboard"))
    expect(onOpenArtboard).toHaveBeenCalledWith("artboard")
  })

  it("quick-creates a grid when none exists", () => {
    const onCreateGrid = vi.fn()
    const { getByLabelText } = render(
      <EditorTopBar activeSection="artboard" onCreateGrid={onCreateGrid} />,
    )
    fireEvent.click(getByLabelText("Grid"))
    expect(onCreateGrid).toHaveBeenCalledTimes(1)
  })

  it("opens the sheet to upload when no image exists (Image frame is selectable)", () => {
    const onOpenArtboard = vi.fn()
    const { getByLabelText } = render(
      <EditorTopBar activeSection="artboard" onOpenArtboard={onOpenArtboard} />,
    )
    fireEvent.click(getByLabelText("Image"))
    expect(onOpenArtboard).toHaveBeenCalledWith("image")
  })

  it("when image-locked: Artboard/Page + Image show Unlock, Grid keeps Edit", () => {
    const onUnlockImage = vi.fn()
    const { getByLabelText, queryByLabelText, getAllByLabelText } = render(
      <EditorTopBar
        activeSection="artboard"
        hasGrid
        hasMasterImage
        imageLocked
        onUnlockImage={onUnlockImage}
      />,
    )
    expect(getAllByLabelText("Unlock image")).toHaveLength(2)
    expect(queryByLabelText("Edit artboard")).toBeNull()
    expect(queryByLabelText("Edit image")).toBeNull()
    expect(getByLabelText("Edit grid")).not.toBeNull()
    fireEvent.click(getAllByLabelText("Unlock image")[0])
    expect(onUnlockImage).toHaveBeenCalledTimes(1)
  })
})
