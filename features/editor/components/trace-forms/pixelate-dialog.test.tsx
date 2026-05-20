/**
 * @vitest-environment jsdom
 *
 * Component test for PixelateDialog.
 *
 * The previous renderer (4-stage pipeline with JS-side upscale) suffered
 * a regression class where `previewSize` React state never received the
 * pane's DOM dimensions, leaving the display canvas at the browser
 * default 300×150. The fix moves the upscale into CSS
 * (`image-rendering: pixelated`), so React owns the canvas `width` /
 * `height` attributes via JSX props derived from the form-driven grid.
 *
 * This test pins that wiring: with `displayMmW=100, displayMmH=75` and
 * the schema-default `supercell_width_mm=supercell_height_mm=6`, the
 * resolved grid is 16 × 12 cells — the canvas must mount with exactly
 * those bitmap dimensions. Catches: cellsX/Y mis-wired to form state,
 * canvas left at browser defaults, mini-canvas not mounted at all.
 */
import { render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/editor/trace/pixelate-preview", () => ({
  buildScratchCanvas: () => {
    // jsdom has no functioning 2D context; return a stub canvas with
    // intrinsic dimensions so the dialog's scratch-state can settle.
    const c = document.createElement("canvas")
    c.width = 100
    c.height = 75
    return c
  },
  buildMiniCanvas: () => {
    // No-op: pixel behaviour is browser-only; component test only
    // asserts the React/JSX wire-up.
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
  // The dialog assigns `onload` before `src`. Schedule the callback
  // on a microtask after construction so the assignment lands first.
  private _onload: (() => void) | null = null
  set onload(fn: (() => void) | null) {
    this._onload = fn
  }
  get onload(): (() => void) | null {
    return this._onload
  }
  onerror: (() => void) | null = null
  constructor() {
    queueMicrotask(() => this._onload?.())
  }
}

describe("PixelateDialog", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", FakeImage)
    // jsdom doesn't ship matchMedia; SidebarProvider uses it via useIsMobile.
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
    vi.unstubAllGlobals()
  })

  it("mounts preview canvas with grid-derived bitmap dimensions", async () => {
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

    // Dialog content is portal-mounted; query the global document.
    // Wait until scratch has loaded so the canvas effect has run at
    // least once — the attrs are React-owned so they're correct from
    // first paint, but waiting for spinner removal proves the wire-up.
    await waitFor(() => {
      const spinner = document.body.querySelector('[role="status"], svg.lucide-loader-2')
      expect(spinner).toBeNull()
    })

    const canvas = document.body.querySelector<HTMLCanvasElement>("canvas")
    expect(canvas).not.toBeNull()
    // Defaults: supercell 6×6mm. displayMm 100×75 → cellsX=16, cellsY=12.
    expect(canvas?.getAttribute("width")).toBe("16")
    expect(canvas?.getAttribute("height")).toBe("12")
  })
})
