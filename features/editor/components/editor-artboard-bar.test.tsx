/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EditorArtboardBar } from "./editor-artboard-bar"

describe("EditorArtboardBar", () => {
  afterEach(() => {
    cleanup()
  })

  it("lays out two horizontal circle buttons (Artboard / Grid)", () => {
    const { container, getByLabelText } = render(<EditorArtboardBar onOpenDialog={() => {}} />)
    const row = container.firstElementChild as HTMLElement
    expect(row.className).toContain("flex-row")
    for (const label of ["Artboard", "Grid"]) {
      const btn = getByLabelText(label)
      expect(btn.tagName).toBe("BUTTON")
      expect(btn.className).toContain("rounded-full")
    }
  })

  it("no longer renders an Image circle (Image lives in the menu bar)", () => {
    const { queryByLabelText } = render(<EditorArtboardBar onOpenDialog={() => {}} />)
    expect(queryByLabelText("Image")).toBeNull()
  })

  it("opens the artboard (canvas size) dialog when the Frame icon is clicked", () => {
    const onOpenDialog = vi.fn()
    const { getByLabelText } = render(<EditorArtboardBar onOpenDialog={onOpenDialog} />)
    fireEvent.click(getByLabelText("Artboard"))
    expect(onOpenDialog).toHaveBeenCalledWith("artboard")
  })

  it("opens the grid dialog when the Grid icon is clicked", () => {
    const onOpenDialog = vi.fn()
    const { getByLabelText } = render(<EditorArtboardBar onOpenDialog={onOpenDialog} />)
    fireEvent.click(getByLabelText("Grid"))
    expect(onOpenDialog).toHaveBeenCalledWith("grid")
  })

  it("both circles are enabled (canvas size + grid don't need an image)", () => {
    const { getByLabelText } = render(<EditorArtboardBar onOpenDialog={() => {}} />)
    for (const label of ["Artboard", "Grid"]) {
      expect((getByLabelText(label) as HTMLButtonElement).disabled).toBe(false)
    }
  })
})
