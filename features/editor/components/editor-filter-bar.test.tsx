/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EditorFilterBar } from "./editor-filter-bar"

describe("EditorFilterBar", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders a single 'Add filter' button when no filter is set", () => {
    const { getByLabelText, queryByLabelText } = render(
      <EditorFilterBar hasFilter={false} onOpen={vi.fn()} onDelete={vi.fn()} onReset={vi.fn()} />,
    )
    expect(queryByLabelText("Delete filter")).toBeNull()
    expect(queryByLabelText("Edit filter")).toBeNull()
    expect(queryByLabelText("Reset filter")).toBeNull()
    expect(getByLabelText("Add filter")).not.toBeNull()
  })

  it("gates the Add button via addDisabled", () => {
    const { getByLabelText } = render(
      <EditorFilterBar hasFilter={false} onOpen={vi.fn()} onDelete={vi.fn()} addDisabled />,
    )
    expect((getByLabelText("Add filter") as HTMLButtonElement).disabled).toBe(true)
  })

  it("with a filter, unlocked: shows Delete·Edit only (no Reset), both active", () => {
    const onOpen = vi.fn()
    const onDelete = vi.fn()
    const { getByLabelText, queryByLabelText, container } = render(
      <EditorFilterBar hasFilter onOpen={onOpen} onDelete={onDelete} onReset={vi.fn()} locked={false} />,
    )
    const labels = Array.from(container.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"))
    expect(labels).toEqual(["Delete filter", "Edit filter"])
    expect(queryByLabelText("Reset filter")).toBeNull()

    fireEvent.click(getByLabelText("Delete filter"))
    expect(onDelete).toHaveBeenCalledOnce()
    fireEvent.click(getByLabelText("Edit filter"))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it("greys out (disables) Delete while not mutable, and it no longer fires", () => {
    const onDelete = vi.fn()
    const { getByLabelText } = render(
      <EditorFilterBar hasFilter onOpen={vi.fn()} onDelete={onDelete} onReset={vi.fn()} deleteDisabled />,
    )
    const del = getByLabelText("Delete filter") as HTMLButtonElement
    expect(del.disabled).toBe(true)
    fireEvent.click(del)
    expect(onDelete).not.toHaveBeenCalled()
  })

  it("with a filter, locked: shows Reset only (no Delete/Edit) and fires onReset", () => {
    const onReset = vi.fn()
    const { getByLabelText, queryByLabelText } = render(
      <EditorFilterBar hasFilter onOpen={vi.fn()} onDelete={vi.fn()} onReset={onReset} locked />,
    )
    expect(queryByLabelText("Delete filter")).toBeNull()
    expect(queryByLabelText("Edit filter")).toBeNull()
    fireEvent.click(getByLabelText("Reset filter"))
    expect(onReset).toHaveBeenCalledOnce()
  })
})
