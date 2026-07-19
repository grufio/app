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

  it("with a filter, unlocked: Delete·Edit·Reset in order, Reset disabled, Delete/Edit active", () => {
    const onOpen = vi.fn()
    const onDelete = vi.fn()
    const { getByLabelText, container } = render(
      <EditorFilterBar hasFilter onOpen={onOpen} onDelete={onDelete} onReset={vi.fn()} locked={false} />,
    )
    const labels = Array.from(container.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"))
    expect(labels).toEqual(["Delete filter", "Edit filter", "Reset filter"])

    expect((getByLabelText("Reset filter") as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(getByLabelText("Delete filter"))
    expect(onDelete).toHaveBeenCalledOnce()
    fireEvent.click(getByLabelText("Edit filter"))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it("with a filter, locked: Delete/Edit disabled, Reset active and fires onReset", () => {
    const onReset = vi.fn()
    const { getByLabelText } = render(
      <EditorFilterBar hasFilter onOpen={vi.fn()} onDelete={vi.fn()} onReset={onReset} locked />,
    )
    expect((getByLabelText("Delete filter") as HTMLButtonElement).disabled).toBe(true)
    expect((getByLabelText("Edit filter") as HTMLButtonElement).disabled).toBe(true)
    expect((getByLabelText("Reset filter") as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(getByLabelText("Reset filter"))
    expect(onReset).toHaveBeenCalledOnce()
  })
})
