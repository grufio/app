/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EditorTraceToolsBar } from "./editor-trace-tools-bar"

describe("EditorTraceToolsBar", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders exactly Hand · Arrow · Zoom out · Zoom in, in order", () => {
    const { container } = render(
      <EditorTraceToolsBar tool="hand" onHand={vi.fn()} onZoomIn={vi.fn()} onZoomOut={vi.fn()} />,
    )
    const labels = Array.from(container.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"))
    expect(labels).toEqual([
      "Hand (Move Artboard)",
      "Select (coming soon)",
      "Zoom out (artboard smaller)",
      "Zoom in (artboard bigger)",
    ])
  })

  it("marks Hand active when the current tool is hand", () => {
    const { getByLabelText } = render(
      <EditorTraceToolsBar tool="hand" onHand={vi.fn()} onZoomIn={vi.fn()} onZoomOut={vi.fn()} />,
    )
    expect(getByLabelText("Hand (Move Artboard)").getAttribute("aria-pressed")).toBe("true")
  })

  it("fires the hand + zoom callbacks", () => {
    const onHand = vi.fn()
    const onZoomIn = vi.fn()
    const onZoomOut = vi.fn()
    const { getByLabelText } = render(
      <EditorTraceToolsBar tool="object" onHand={onHand} onZoomIn={onZoomIn} onZoomOut={onZoomOut} />,
    )
    fireEvent.click(getByLabelText("Hand (Move Artboard)"))
    expect(onHand).toHaveBeenCalledOnce()
    fireEvent.click(getByLabelText("Zoom in (artboard bigger)"))
    expect(onZoomIn).toHaveBeenCalledOnce()
    fireEvent.click(getByLabelText("Zoom out (artboard smaller)"))
    expect(onZoomOut).toHaveBeenCalledOnce()
  })

  it("the Arrow is an inert placeholder (no crash, no handler) until wired", () => {
    const { getByLabelText } = render(
      <EditorTraceToolsBar tool="hand" onHand={vi.fn()} onZoomIn={vi.fn()} onZoomOut={vi.fn()} />,
    )
    // Clicking the placeholder must be a safe no-op.
    expect(() => fireEvent.click(getByLabelText("Select (coming soon)"))).not.toThrow()
  })

  it("disables the zoom actions when actionsDisabled", () => {
    const { getByLabelText } = render(
      <EditorTraceToolsBar
        tool="hand"
        onHand={vi.fn()}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        actionsDisabled
      />,
    )
    expect((getByLabelText("Zoom in (artboard bigger)") as HTMLButtonElement).disabled).toBe(true)
    expect((getByLabelText("Zoom out (artboard smaller)") as HTMLButtonElement).disabled).toBe(true)
  })
})
