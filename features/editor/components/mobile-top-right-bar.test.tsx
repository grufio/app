/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MobileTopRightBar } from "./mobile-top-right-bar"

function defaultViewOptions() {
  return {
    traceOverlayVisible: true,
    previewBitmapVisible: true,
    numbersLayerVisible: true,
    onTraceOverlayChange: vi.fn(),
    onPreviewBitmapChange: vi.fn(),
    onNumbersLayerChange: vi.fn(),
  }
}

function setupRadixPolyfills() {
  if (typeof window.PointerEvent === "undefined") {
    // @ts-expect-error: jsdom polyfill
    window.PointerEvent = class PointerEvent extends MouseEvent {}
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {}
  }
}

function openMenu(getByLabelText: (label: string) => HTMLElement) {
  const trigger = getByLabelText("View options")
  fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" })
  fireEvent.pointerUp(trigger, { button: 0, pointerType: "mouse" })
  fireEvent.click(trigger)
}

describe("MobileTopRightBar", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders the Eye (view-options) and never an Edit affordance", () => {
    setupRadixPolyfills()
    const { getByLabelText, queryByLabelText } = render(
      <MobileTopRightBar viewOptions={defaultViewOptions()} />,
    )
    expect(getByLabelText("View options")).not.toBeNull()
    expect(queryByLabelText("Edit")).toBeNull()
    expect(queryByLabelText("Edit trace")).toBeNull()
    expect(queryByLabelText("Edit artboard")).toBeNull()
  })

  it("renders nothing when there are no view-options", () => {
    const { queryByRole } = render(<MobileTopRightBar viewOptions={null} />)
    expect(queryByRole("toolbar")).toBeNull()
  })

  it("opens the menu with three checkbox items in order", async () => {
    setupRadixPolyfills()
    const { getByLabelText } = render(
      <MobileTopRightBar viewOptions={defaultViewOptions()} />,
    )
    openMenu(getByLabelText)
    await waitFor(() => {
      const items = document.body.querySelectorAll(
        '[data-slot="dropdown-menu-checkbox-item"]',
      )
      expect(items).toHaveLength(3)
    })
    const items = Array.from(
      document.body.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"]'),
    )
    expect(items.map((el) => el.textContent?.trim())).toEqual(["Trace", "Preview", "Numbers"])
  })

  it("reflects the unchecked state for items whose prop is false", async () => {
    setupRadixPolyfills()
    const { getByLabelText } = render(
      <MobileTopRightBar
        viewOptions={{ ...defaultViewOptions(), numbersLayerVisible: false }}
      />,
    )
    openMenu(getByLabelText)
    await waitFor(() => {
      expect(
        document.body.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"]').length,
      ).toBe(3)
    })
    const items = Array.from(
      document.body.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"]'),
    )
    expect(items[0].getAttribute("aria-checked")).toBe("true")
    expect(items[1].getAttribute("aria-checked")).toBe("true")
    expect(items[2].getAttribute("aria-checked")).toBe("false")
  })

  it("toggle calls the matching setter with inverted value", async () => {
    setupRadixPolyfills()
    const opts = defaultViewOptions()
    const { getByLabelText } = render(
      <MobileTopRightBar viewOptions={opts} />,
    )
    openMenu(getByLabelText)
    await waitFor(() => {
      expect(
        document.body.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"]').length,
      ).toBe(3)
    })
    const items = Array.from(
      document.body.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"]'),
    ) as HTMLElement[]
    fireEvent.click(items[0])
    expect(opts.onTraceOverlayChange).toHaveBeenCalledWith(false)
    expect(opts.onPreviewBitmapChange).not.toHaveBeenCalled()
    expect(opts.onNumbersLayerChange).not.toHaveBeenCalled()
  })

  it("keeps the menu open after a toggle (preventDefault on select)", async () => {
    setupRadixPolyfills()
    const { getByLabelText } = render(
      <MobileTopRightBar viewOptions={defaultViewOptions()} />,
    )
    openMenu(getByLabelText)
    await waitFor(() => {
      expect(
        document.body.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"]').length,
      ).toBe(3)
    })
    const items = Array.from(
      document.body.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"]'),
    ) as HTMLElement[]
    fireEvent.click(items[1])
    expect(
      document.body.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"]').length,
    ).toBe(3)
  })

  it("marks the Eye-button as pressed while the menu is open", async () => {
    setupRadixPolyfills()
    const { getByLabelText } = render(
      <MobileTopRightBar viewOptions={defaultViewOptions()} />,
    )
    expect(getByLabelText("View options").getAttribute("aria-pressed")).not.toBe("true")
    openMenu(getByLabelText)
    await waitFor(() => {
      expect(getByLabelText("View options").getAttribute("aria-pressed")).toBe("true")
    })
  })

  describe("theme toggle", () => {
    it("renders the toggle with only a theme (no view-options) and renders nothing when both are absent", () => {
      const { getByLabelText, queryByLabelText, queryByRole, rerender } = render(
        <MobileTopRightBar viewOptions={null} theme={{ value: "dark", onToggle: vi.fn() }} />,
      )
      // Dark → offers "Switch to light theme"; no Eye when viewOptions is null.
      expect(getByLabelText("Switch to light theme")).not.toBeNull()
      expect(queryByLabelText("View options")).toBeNull()
      // Both absent → nothing.
      rerender(<MobileTopRightBar viewOptions={null} theme={null} />)
      expect(queryByRole("toolbar")).toBeNull()
    })

    it("shows the Moon label while light and calls onToggle", () => {
      const onToggle = vi.fn()
      const { getByLabelText } = render(
        <MobileTopRightBar viewOptions={null} theme={{ value: "light", onToggle }} />,
      )
      const btn = getByLabelText("Switch to dark theme")
      fireEvent.click(btn)
      expect(onToggle).toHaveBeenCalledTimes(1)
    })

    it("shows both the Eye and the theme toggle on the trace case", () => {
      const { getByLabelText } = render(
        <MobileTopRightBar viewOptions={defaultViewOptions()} theme={{ value: "dark", onToggle: vi.fn() }} />,
      )
      expect(getByLabelText("View options")).not.toBeNull()
      expect(getByLabelText("Switch to light theme")).not.toBeNull()
    })
  })

  describe("desktop variant", () => {
    it("keeps `md:hidden` by default (mobile-only callers unchanged)", () => {
      const { getByRole } = render(
        <MobileTopRightBar viewOptions={defaultViewOptions()} />,
      )
      expect(getByRole("toolbar").className).toContain("md:hidden")
    })

    it("drops `md:hidden` when desktop is set (bar stays visible on md+)", () => {
      const { getByRole } = render(
        <MobileTopRightBar viewOptions={defaultViewOptions()} desktop />,
      )
      expect(getByRole("toolbar").className).not.toContain("md:hidden")
    })
  })
})
