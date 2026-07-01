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
    const onOpen = vi.fn()
    const onDelete = vi.fn()
    const { getByLabelText, queryByLabelText } = render(
      <EditorImageBar hasImage={false} onOpen={onOpen} onDelete={onDelete} />,
    )
    expect(queryByLabelText("Delete image")).toBeNull()
    expect(queryByLabelText("Edit image")).toBeNull()
    fireEvent.click(getByLabelText("Add image"))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it("renders Delete (left) + Edit (right) when a master image exists", () => {
    const onOpen = vi.fn()
    const onDelete = vi.fn()
    const { getByLabelText, container } = render(
      <EditorImageBar hasImage onOpen={onOpen} onDelete={onDelete} />,
    )
    // Order: delete sits to the left of edit.
    const labels = Array.from(container.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"))
    expect(labels).toEqual(["Delete image", "Edit image"])

    fireEvent.click(getByLabelText("Delete image"))
    expect(onDelete).toHaveBeenCalledOnce()
    fireEvent.click(getByLabelText("Edit image"))
    expect(onOpen).toHaveBeenCalledOnce()
  })
})
