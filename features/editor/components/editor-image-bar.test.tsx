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

  it("with an image, unlocked: Delete·Edit·Reset in order, Reset disabled, Delete/Edit active", () => {
    const onOpen = vi.fn()
    const onDelete = vi.fn()
    const { getByLabelText, container } = render(
      <EditorImageBar hasImage onOpen={onOpen} onDelete={onDelete} onReset={vi.fn()} locked={false} />,
    )
    const labels = Array.from(container.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"))
    expect(labels).toEqual(["Delete image", "Edit image", "Reset image"])

    expect((getByLabelText("Reset image") as HTMLButtonElement).disabled).toBe(true)
    expect((getByLabelText("Delete image") as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(getByLabelText("Delete image"))
    expect(onDelete).toHaveBeenCalledOnce()
    fireEvent.click(getByLabelText("Edit image"))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it("with an image, locked: Delete/Edit disabled, Reset active and fires onReset", () => {
    const onReset = vi.fn()
    const { getByLabelText } = render(
      <EditorImageBar hasImage onOpen={vi.fn()} onDelete={vi.fn()} onReset={onReset} locked />,
    )
    expect((getByLabelText("Delete image") as HTMLButtonElement).disabled).toBe(true)
    expect((getByLabelText("Edit image") as HTMLButtonElement).disabled).toBe(true)
    expect((getByLabelText("Reset image") as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(getByLabelText("Reset image"))
    expect(onReset).toHaveBeenCalledOnce()
  })
})
