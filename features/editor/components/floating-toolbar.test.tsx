/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { FloatingToolbar } from "./floating-toolbar"

afterEach(cleanup)

function renderToolbar(overrides: Partial<React.ComponentProps<typeof FloatingToolbar>> = {}) {
  const handlers = {
    onToolChange: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onFit: vi.fn(),
    onRotate: vi.fn(),
  }
  render(<FloatingToolbar tool="object" {...handlers} {...overrides} />)
  return handlers
}

describe("FloatingToolbar", () => {
  it("renders the default tools and actions", () => {
    renderToolbar()
    for (const name of ["Object (Move Image)", "Hand (Move Artboard)", "Crop", "Zoom in", "Zoom out", "Fit to screen", "Rotate 90°"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy()
    }
  })

  it("hides Direct-Select by default and shows it when enabled", () => {
    renderToolbar()
    expect(screen.queryByRole("button", { name: "Direct (Select Trace Region)" })).toBeNull()

    cleanup()
    renderToolbar({ showDirectSelect: true })
    expect(screen.getByRole("button", { name: "Direct (Select Trace Region)" })).toBeTruthy()
  })

  it("marks the active tool with aria-pressed", () => {
    renderToolbar({ tool: "hand" })
    expect(screen.getByRole("button", { name: "Hand (Move Artboard)" }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("button", { name: "Object (Move Image)" }).getAttribute("aria-pressed")).toBeNull()
  })

  it("fires onToolChange with the clicked tool", () => {
    const h = renderToolbar()
    fireEvent.click(screen.getByRole("button", { name: "Hand (Move Artboard)" }))
    expect(h.onToolChange).toHaveBeenCalledWith("hand")
    fireEvent.click(screen.getByRole("button", { name: "Crop" }))
    expect(h.onToolChange).toHaveBeenCalledWith("crop")
  })

  it("fires the action handlers", () => {
    const h = renderToolbar()
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }))
    fireEvent.click(screen.getByRole("button", { name: "Fit to screen" }))
    fireEvent.click(screen.getByRole("button", { name: "Rotate 90°" }))
    expect(h.onZoomIn).toHaveBeenCalledOnce()
    expect(h.onFit).toHaveBeenCalledOnce()
    expect(h.onRotate).toHaveBeenCalledOnce()
  })

  it("disables actions when actionsDisabled, and crop/rotate via their flags", () => {
    renderToolbar({ actionsDisabled: true, cropDisabled: true, rotateDisabled: true })
    expect((screen.getByRole("button", { name: "Zoom in" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Crop" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Rotate 90°" }) as HTMLButtonElement).disabled).toBe(true)
    // Tool buttons stay enabled — only actions are gated.
    expect((screen.getByRole("button", { name: "Object (Move Image)" }) as HTMLButtonElement).disabled).toBe(false)
  })
})
