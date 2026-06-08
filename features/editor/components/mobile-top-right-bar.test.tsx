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

  it("renders only the Edit button when viewOptions is null", () => {
    const onEditTap = vi.fn()
    const { getByLabelText, queryByLabelText } = render(
      <MobileTopRightBar
        onEditTap={onEditTap}
        ariaLabelEdit="Edit trace"
        viewOptions={null}
      />,
    )
    expect(getByLabelText("Edit trace")).not.toBeNull()
    expect(queryByLabelText("View options")).toBeNull()
  })

  it("renders both Eye and Edit when viewOptions is provided", () => {
    setupRadixPolyfills()
    const { getByLabelText } = render(
      <MobileTopRightBar
        onEditTap={vi.fn()}
        ariaLabelEdit="Edit trace"
        viewOptions={defaultViewOptions()}
      />,
    )
    expect(getByLabelText("View options")).not.toBeNull()
    expect(getByLabelText("Edit trace")).not.toBeNull()
  })

  it("Edit-tap calls onEditTap", () => {
    setupRadixPolyfills()
    const onEditTap = vi.fn()
    const { getByLabelText } = render(
      <MobileTopRightBar
        onEditTap={onEditTap}
        ariaLabelEdit="Edit trace"
        viewOptions={null}
      />,
    )
    fireEvent.click(getByLabelText("Edit trace"))
    expect(onEditTap).toHaveBeenCalledTimes(1)
  })

  it("opens the menu with three checkbox items in order", async () => {
    setupRadixPolyfills()
    const { getByLabelText } = render(
      <MobileTopRightBar
        onEditTap={vi.fn()}
        viewOptions={defaultViewOptions()}
      />,
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
        onEditTap={vi.fn()}
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
      <MobileTopRightBar onEditTap={vi.fn()} viewOptions={opts} />,
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
      <MobileTopRightBar onEditTap={vi.fn()} viewOptions={defaultViewOptions()} />,
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
      <MobileTopRightBar onEditTap={vi.fn()} viewOptions={defaultViewOptions()} />,
    )
    expect(getByLabelText("View options").getAttribute("aria-pressed")).not.toBe("true")
    openMenu(getByLabelText)
    await waitFor(() => {
      expect(getByLabelText("View options").getAttribute("aria-pressed")).toBe("true")
    })
  })
})
