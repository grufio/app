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

  it("renders the three artboard action circles (Artboard / Grid / Image)", () => {
    const { getByLabelText } = render(<EditorArtboardBar />)
    for (const label of ["Artboard", "Grid", "Image"]) {
      const btn = getByLabelText(label)
      expect(btn.tagName).toBe("BUTTON")
      // 40px circle chips are round.
      expect(btn.className).toContain("rounded-full")
    }
  })

  it("lays the circles out horizontally", () => {
    const { container } = render(<EditorArtboardBar />)
    const row = container.firstElementChild as HTMLElement
    expect(row.className).toContain("flex-row")
    expect(row.querySelectorAll("button")).toHaveLength(3)
  })
})
