/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ImagePanel } from "./image-panel"

afterEach(cleanup)

function renderPanel(overrides: Partial<React.ComponentProps<typeof ImagePanel>> = {}) {
  const handlers = {
    onCommit: vi.fn(),
    onCommitPosition: vi.fn(),
    onAlign: vi.fn(),
    onRestore: vi.fn(),
    onFitToArtboard: vi.fn(),
  }
  render(
    <ImagePanel
      unit="mm"
      widthPxU={1_000_000n}
      heightPxU={1_000_000n}
      xPxU={0n}
      yPxU={0n}
      {...handlers}
      {...overrides}
    />,
  )
  return handlers
}

describe("ImagePanel", () => {
  it("renders the header actions disabled by default (Delete now lives in the sheet footer)", () => {
    renderPanel()
    expect((screen.getByRole("button", { name: "Restore image" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Fit image to artboard" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole("button", { name: "Delete image" })).toBeNull()
  })

  it("enables actions per their can* flags", () => {
    renderPanel({ canRestore: true, canFit: true })
    expect((screen.getByRole("button", { name: "Restore image" }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole("button", { name: "Fit image to artboard" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("fires the header action handlers when enabled", () => {
    const h = renderPanel({ canRestore: true, canFit: true })
    fireEvent.click(screen.getByRole("button", { name: "Restore image" }))
    fireEvent.click(screen.getByRole("button", { name: "Fit image to artboard" }))
    expect(h.onRestore).toHaveBeenCalledOnce()
    expect(h.onFitToArtboard).toHaveBeenCalledOnce()
  })
})
