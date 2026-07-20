/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EditorTraceBar } from "./editor-trace-bar"

describe("EditorTraceBar", () => {
  afterEach(() => cleanup())

  it("with no trace: a single Add button, no delete / no colors", () => {
    const { getByLabelText, queryByLabelText } = render(
      <EditorTraceBar hasTrace={false} onOpen={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(getByLabelText("Add trace")).toBeTruthy()
    expect(queryByLabelText("Delete trace")).toBeNull()
    expect(queryByLabelText(/^Colors/)).toBeNull()
  })

  it("with a trace: Delete + Edit, and Edit/Delete fire their handlers", () => {
    const onOpen = vi.fn()
    const onDelete = vi.fn()
    const { getByLabelText } = render(<EditorTraceBar hasTrace onOpen={onOpen} onDelete={onDelete} />)
    fireEvent.click(getByLabelText("Edit trace"))
    expect(onOpen).toHaveBeenCalledOnce()
    fireEvent.click(getByLabelText("Delete trace"))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it("shows the colours button (bold count, no icon) when the trace has colours", () => {
    const onOpenColors = vi.fn()
    const { getByLabelText, getByText } = render(
      <EditorTraceBar hasTrace onOpen={vi.fn()} onDelete={vi.fn()} colorCount={16} onOpenColors={onOpenColors} />,
    )
    const btn = getByLabelText("Colors (16)")
    expect(btn).toBeTruthy()
    expect(getByText("16")).toBeTruthy()
    fireEvent.click(btn)
    expect(onOpenColors).toHaveBeenCalledOnce()
  })

  it("hides the colours button for count null / 0 / no handler", () => {
    const { queryByLabelText, rerender } = render(
      <EditorTraceBar hasTrace onOpen={vi.fn()} onDelete={vi.fn()} colorCount={null} onOpenColors={vi.fn()} />,
    )
    expect(queryByLabelText(/^Colors/)).toBeNull()

    rerender(<EditorTraceBar hasTrace onOpen={vi.fn()} onDelete={vi.fn()} colorCount={0} onOpenColors={vi.fn()} />)
    expect(queryByLabelText(/^Colors/)).toBeNull()

    rerender(<EditorTraceBar hasTrace onOpen={vi.fn()} onDelete={vi.fn()} colorCount={5} />)
    expect(queryByLabelText(/^Colors/)).toBeNull()
  })

  it("hides the colours button when no trace is set even if a count is passed", () => {
    const { queryByLabelText } = render(
      <EditorTraceBar hasTrace={false} onOpen={vi.fn()} onDelete={vi.fn()} colorCount={16} onOpenColors={vi.fn()} />,
    )
    expect(queryByLabelText(/^Colors/)).toBeNull()
  })
})
