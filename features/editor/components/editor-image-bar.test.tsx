/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EditorImageBar } from "./editor-image-bar"

describe("EditorImageBar", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders a single 'Add image' button when there is no master image", () => {
    const { getByLabelText, queryByLabelText } = render(
      <EditorImageBar hasImage={false} onOpen={vi.fn()} onDelete={vi.fn()} onReset={vi.fn()} />,
    )
    expect(queryByLabelText("Delete image")).toBeNull()
    expect(queryByLabelText("Edit image")).toBeNull()
    expect(queryByLabelText("Reset image")).toBeNull()
    expect(getByLabelText("Add image")).not.toBeNull()
  })

  it("with an image, unlocked: shows Delete·Edit only (no Reset), both active", () => {
    const onOpen = vi.fn()
    const onDelete = vi.fn()
    const { getByLabelText, queryByLabelText, container } = render(
      <EditorImageBar hasImage onOpen={onOpen} onDelete={onDelete} onReset={vi.fn()} locked={false} />,
    )
    const labels = Array.from(container.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"))
    expect(labels).toEqual(["Delete image", "Edit image"])
    expect(queryByLabelText("Reset image")).toBeNull()

    fireEvent.click(getByLabelText("Delete image"))
    expect(onDelete).toHaveBeenCalledOnce()
    fireEvent.click(getByLabelText("Edit image"))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it("with an image, locked: shows Reset only (no Delete/Edit) and fires onReset", () => {
    const onReset = vi.fn()
    const { getByLabelText, queryByLabelText } = render(
      <EditorImageBar hasImage onOpen={vi.fn()} onDelete={vi.fn()} onReset={onReset} locked />,
    )
    expect(queryByLabelText("Delete image")).toBeNull()
    expect(queryByLabelText("Edit image")).toBeNull()
    fireEvent.click(getByLabelText("Reset image"))
    expect(onReset).toHaveBeenCalledOnce()
  })
})
