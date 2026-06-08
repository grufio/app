/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MobileViewOptionsButton } from "./mobile-view-options-button"

function defaults() {
  return {
    traceOverlayVisible: true,
    previewBitmapVisible: true,
    numbersLayerVisible: true,
    onTraceOverlayChange: vi.fn(),
    onPreviewBitmapChange: vi.fn(),
    onNumbersLayerChange: vi.fn(),
  }
}

// Radix DropdownMenu uses pointer events for portal-positioning;
// jsdom doesn't implement them. Stubbing PointerEvent + scrollIntoView
// is the canonical workaround.
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

describe("MobileViewOptionsButton", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders the trigger button with an accessible name", () => {
    setupRadixPolyfills()
    const { getByLabelText } = render(<MobileViewOptionsButton {...defaults()} />)
    expect(getByLabelText("View options")).not.toBeNull()
  })

  it("opens the menu on trigger click and shows the three checkbox items", async () => {
    setupRadixPolyfills()
    const props = defaults()
    const { getByLabelText } = render(<MobileViewOptionsButton {...props} />)

    const trigger = getByLabelText("View options") as HTMLElement
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" })
    fireEvent.pointerUp(trigger, { button: 0, pointerType: "mouse" })
    fireEvent.click(trigger)

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
    // All three start checked (defaults are true).
    items.forEach((el) => {
      expect(el.getAttribute("aria-checked")).toBe("true")
    })
  })

  it("reflects the unchecked state for items whose prop is false", async () => {
    setupRadixPolyfills()
    const props = { ...defaults(), numbersLayerVisible: false }
    const { getByLabelText } = render(<MobileViewOptionsButton {...props} />)

    const trigger = getByLabelText("View options") as HTMLElement
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" })
    fireEvent.pointerUp(trigger, { button: 0, pointerType: "mouse" })
    fireEvent.click(trigger)
    await waitFor(() => {
      expect(
        document.body.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"]').length,
      ).toBe(3)
    })

    const items = Array.from(
      document.body.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"]'),
    )
    expect(items[0].getAttribute("aria-checked")).toBe("true") // Trace
    expect(items[1].getAttribute("aria-checked")).toBe("true") // Preview
    expect(items[2].getAttribute("aria-checked")).toBe("false") // Numbers
  })

  it("calls the matching setter with the inverted value when an item is clicked", async () => {
    setupRadixPolyfills()
    const props = defaults()
    const { getByLabelText } = render(<MobileViewOptionsButton {...props} />)

    const trigger = getByLabelText("View options") as HTMLElement
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" })
    fireEvent.pointerUp(trigger, { button: 0, pointerType: "mouse" })
    fireEvent.click(trigger)
    await waitFor(() => {
      expect(
        document.body.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"]').length,
      ).toBe(3)
    })

    const items = Array.from(
      document.body.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"]'),
    ) as HTMLElement[]

    fireEvent.click(items[0]) // Trace
    expect(props.onTraceOverlayChange).toHaveBeenCalledWith(false)
    expect(props.onPreviewBitmapChange).not.toHaveBeenCalled()
    expect(props.onNumbersLayerChange).not.toHaveBeenCalled()
  })

  it("keeps the menu open after a checkbox toggle (preventDefault on select)", async () => {
    setupRadixPolyfills()
    const { getByLabelText } = render(<MobileViewOptionsButton {...defaults()} />)
    const trigger = getByLabelText("View options") as HTMLElement
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" })
    fireEvent.pointerUp(trigger, { button: 0, pointerType: "mouse" })
    fireEvent.click(trigger)
    await waitFor(() => {
      expect(
        document.body.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"]').length,
      ).toBe(3)
    })

    const items = Array.from(
      document.body.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"]'),
    ) as HTMLElement[]
    fireEvent.click(items[1]) // Preview

    // Menu content node is still mounted (still has the three items).
    expect(
      document.body.querySelectorAll('[data-slot="dropdown-menu-checkbox-item"]').length,
    ).toBe(3)
  })
})
