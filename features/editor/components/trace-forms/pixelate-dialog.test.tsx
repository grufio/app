/**
 * @vitest-environment jsdom
 *
 * Smoke test for PixelateDialog. Detailed wiring assertions live in
 * pixelate-preview-pane.test.tsx and pixelate-form.test.tsx; this
 * test only verifies that the Dialog composes the three sub-pieces
 * (preview canvas + form + Apply/Cancel buttons) when open.
 */
import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/editor/trace/pixelate-preview", () => ({
  buildMiniCanvas: () => {
    /* noop in jsdom */
  },
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}))

import { PixelateDialog } from "./pixelate-dialog"

class FakeImage {
  src = ""
  crossOrigin: string | null = null
  naturalWidth = 100
  naturalHeight = 75
  private _onload: (() => void) | null = null
  set onload(fn: (() => void) | null) {
    this._onload = fn
    if (fn) queueMicrotask(() => this._onload?.())
  }
  get onload(): (() => void) | null {
    return this._onload
  }
  onerror: (() => void) | null = null
}

// jsdom ships no ResizeObserver; the preview pane uses one to measure
// itself. A no-op stub keeps mount from throwing (the smoke test doesn't
// assert on the measured size).
class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("PixelateDialog (smoke)", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", FakeImage)
    vi.stubGlobal("ResizeObserver", FakeResizeObserver)
    if (!window.matchMedia) {
      window.matchMedia = (query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList
    }
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("renders preview canvas + form inputs + Apply/Cancel when open", async () => {
    render(
      <PixelateDialog
        open
        sourceImageUrl="https://example.test/img.png"
        displayMmW={100}
        displayMmH={75}
        onClose={() => {}}
        onSuccess={() => {}}
        onApplyTrace={async () => {}}
      />,
    )

    await waitFor(() => {
      expect(document.body.querySelector('[data-testid="pixelate-preview-mini"]')).not.toBeNull()
    })
    expect(document.body.querySelector("#supercell_width_mm")).not.toBeNull()
    expect(document.body.querySelector("#num_colors")).not.toBeNull()

    const buttons = Array.from(document.body.querySelectorAll("button"))
    const cancel = buttons.find((b) => b.textContent?.trim() === "Cancel")
    const apply = buttons.find((b) => b.textContent?.trim().startsWith("Apply"))
    expect(cancel).toBeTruthy()
    expect(apply).toBeTruthy()
  })
})
