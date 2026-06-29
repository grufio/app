/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { EditorArtboardBar } from "./editor-artboard-bar"

describe("EditorArtboardBar", () => {
  afterEach(() => {
    cleanup()
  })

  it("lays out two horizontal circle buttons (Artboard / Grid)", () => {
    const { container, getByLabelText } = render(<EditorArtboardBar hasImage />)
    const row = container.firstElementChild as HTMLElement
    expect(row.className).toContain("flex-row")
    for (const label of ["Artboard", "Grid"]) {
      const btn = getByLabelText(label)
      expect(btn.tagName).toBe("BUTTON")
      expect(btn.className).toContain("rounded-full")
    }
  })

  it("no longer renders an Image circle (moved to the canvas toolbar)", () => {
    const { queryByLabelText } = render(<EditorArtboardBar hasImage />)
    expect(queryByLabelText("Image")).toBeNull()
  })

  it("with an image: both circles are enabled", () => {
    const { getByLabelText } = render(<EditorArtboardBar hasImage />)
    for (const label of ["Artboard", "Grid"]) {
      expect((getByLabelText(label) as HTMLButtonElement).disabled).toBe(false)
    }
  })

  it("without an image: Artboard + Grid are disabled", () => {
    const { getByLabelText } = render(<EditorArtboardBar hasImage={false} />)
    expect((getByLabelText("Artboard") as HTMLButtonElement).disabled).toBe(true)
    expect((getByLabelText("Grid") as HTMLButtonElement).disabled).toBe(true)
  })
})
