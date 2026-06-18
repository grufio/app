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

  it("lays out three horizontal circle buttons (Artboard / Grid / Image)", () => {
    const { container, getByLabelText } = render(<EditorArtboardBar hasImage />)
    const row = container.firstElementChild as HTMLElement
    expect(row.className).toContain("flex-row")
    for (const label of ["Artboard", "Grid", "Image"]) {
      const btn = getByLabelText(label)
      expect(btn.tagName).toBe("BUTTON")
      expect(btn.className).toContain("rounded-full")
    }
  })

  it("with an image: all three circles are enabled", () => {
    const { getByLabelText } = render(<EditorArtboardBar hasImage />)
    for (const label of ["Artboard", "Grid", "Image"]) {
      expect((getByLabelText(label) as HTMLButtonElement).disabled).toBe(false)
    }
  })

  it("with an image: tapping Image opens the image dialog", () => {
    const onOpenImage = vi.fn()
    const { getByLabelText } = render(<EditorArtboardBar hasImage onOpenImage={onOpenImage} />)
    fireEvent.click(getByLabelText("Image"))
    expect(onOpenImage).toHaveBeenCalledTimes(1)
  })

  it("without an image: Artboard + Grid disabled, Image is an enabled add-image", () => {
    const { getByLabelText } = render(<EditorArtboardBar hasImage={false} />)
    expect((getByLabelText("Artboard") as HTMLButtonElement).disabled).toBe(true)
    expect((getByLabelText("Grid") as HTMLButtonElement).disabled).toBe(true)
    const image = getByLabelText("Image") as HTMLButtonElement
    expect(image.disabled).toBe(false)
    // The Image circle shows the "image with plus" (add) icon.
    expect(image.querySelector("svg")?.getAttribute("class")).toContain("image-plus")
  })

  it("without an image: tapping the add-image circle does nothing (not wired yet)", () => {
    const onOpenImage = vi.fn()
    const { getByLabelText } = render(
      <EditorArtboardBar hasImage={false} onOpenImage={onOpenImage} />,
    )
    fireEvent.click(getByLabelText("Image"))
    expect(onOpenImage).not.toHaveBeenCalled()
  })
})
