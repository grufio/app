/**
 * @vitest-environment jsdom
 *
 * Component test for PixelateDialog.
 *
 * The dialog renders TWO canvas layers in the preview pane:
 *   - `pixelate-preview-base`  — full original scratch (intrinsic dims),
 *     so the discarded centred border stays visible to the user.
 *   - `pixelate-preview-mini`  — cellsX × cellsY bitmap positioned over
 *     the crop region; `image-rendering: pixelated` does the upscale.
 *
 * This test pins the React/JSX wiring of the mini canvas: with
 * `displayMmW=100, displayMmH=75` and the schema defaults
 * (supercell 6mm), the resolved grid is 16 × 12 cells — the mini
 * canvas must mount with exactly those bitmap dimensions. It also
 * asserts the base canvas is present so the "show full image" layer
 * cannot silently regress. Catches: cellsX/Y mis-wired to form
 * state, mini left at browser defaults, base layer omitted.
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

  it("mounts base + mini canvases with grid-derived bitmap dimensions", async () => {
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
    // Wait until scratch has loaded (base canvas only renders then).
    await waitFor(() => {
      const base = document.body.querySelector('[data-testid="pixelate-preview-base"]')
      expect(base).not.toBeNull()
    })

    // Base canvas reflects the (mocked) scratch intrinsic size 100×75.
    const base = document.body.querySelector<HTMLCanvasElement>(
      '[data-testid="pixelate-preview-base"]',
    )
    expect(base?.getAttribute("width")).toBe("100")
    expect(base?.getAttribute("height")).toBe("75")

    // Mini canvas: supercell 6×6mm defaults, displayMm 100×75 → 16×12 cells.
    const mini = document.body.querySelector<HTMLCanvasElement>(
      '[data-testid="pixelate-preview-mini"]',
    )
    expect(mini).not.toBeNull()
    expect(mini?.getAttribute("width")).toBe("16")
    expect(mini?.getAttribute("height")).toBe("12")
  })
})
