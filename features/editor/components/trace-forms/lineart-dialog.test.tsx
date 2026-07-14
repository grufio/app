/**
 * @vitest-environment jsdom
 *
 * Smoke test for LineArtDialog. Detailed wiring lives in
 * lineart-form / lineart-preview-pane / lineart-preview.test files;
 * this only verifies the dialog composes the three sub-pieces
 * (preview canvas + form + Apply/Cancel) on desktop, and the
 * edit-overlay ↔ preview toggle plus apply icon on mobile.
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/editor/trace/lineart-preview", () => ({
  loadAndDownscale: () => ({ width: 32, height: 24, rgba: new Uint8ClampedArray(32 * 24 * 4) }),
  gaussianBlur: (img: unknown) => img,
  rgbaFromPaintMap: () => new Uint8ClampedArray(32 * 24 * 4),
  buildLineartPreviewSvg: () => ({ svg: '<svg id="mock-preview"></svg>', indicesUsed: [] }),
}))

vi.mock("@/lib/editor/trace/coverage-select", () => ({
  coverageSelectPaintMap: () => new Int32Array(32 * 24),
}))

vi.mock("@/lib/editor/trace/lineart-vtracer-wasm", () => ({
  traceRgbaToSvg: () => Promise.resolve('<svg><path d="M0 0" fill="#123456"/></svg>'),
}))

vi.mock("@/lib/editor/trace/use-trace-palette", () => ({
  useTracePalette: () => null,
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}))

import { FakeImage, FakeResizeObserver } from "@/lib/test/jsdom-stubs"

import { LineArtDialog } from "./lineart-dialog"

describe("LineArtDialog (smoke)", () => {
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

  it("opens on the params overlay with form + Cancel/Preview, and an Apply icon", async () => {
    render(
      <LineArtDialog
        open
        sourceImageUrl="https://example.test/img.png"
        displayMmW={100}
        displayMmH={75}
        onClose={() => {}}
        onSuccess={() => {}}
        onApplyTrace={async () => {}}
      />,
    )

    // Unified fullscreen flow (desktop matches mobile): opens on the params
    // overlay (form mounted); the preview pane is lazy.
    await waitFor(() => {
      expect(document.body.querySelector("#line_thickness")).not.toBeNull()
    })
    expect(document.body.querySelector("#blur_amount")).not.toBeNull()
    expect(document.body.querySelector("#smoothness")).not.toBeNull()
    expect(document.body.querySelector("#color_mode")).not.toBeNull()
    expect(document.body.querySelector("#num_colors")).not.toBeNull()
    expect(document.body.querySelector('[data-testid="lineart-preview-mini"]')).toBeNull()

    const buttons = Array.from(document.body.querySelectorAll("button"))
    expect(buttons.find((b) => b.textContent?.trim() === "Cancel")).toBeTruthy()
    expect(buttons.find((b) => b.textContent?.trim() === "Preview")).toBeTruthy()
    expect(document.body.querySelector('button[aria-label="Apply filter"]')).not.toBeNull()
  })

  it("mobile: opens on params; Preview reveals preview; pencil re-opens; apply icon fires the trace", async () => {
    window.matchMedia = ((query: string) =>
      ({
        matches: true,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia

    const onApplyTrace = vi.fn(async () => {})
    render(
      <LineArtDialog
        open
        sourceImageUrl="https://example.test/img.png"
        displayMmW={100}
        displayMmH={75}
        onClose={() => {}}
        onSuccess={() => {}}
        onApplyTrace={onApplyTrace}
      />,
    )

    await waitFor(() => {
      expect(document.body.querySelector("#line_thickness")).not.toBeNull()
    })
    // Preview pane is lazy on mobile — not mounted until the user taps Preview.
    expect(document.body.querySelector('[data-testid="lineart-preview-mini"]')).toBeNull()

    const preview = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Preview",
    ) as HTMLButtonElement
    expect(preview).toBeTruthy()
    fireEvent.click(preview)
    await waitFor(() => {
      expect(document.body.querySelector("#line_thickness")).toBeNull()
    })
    expect(document.body.querySelector('[data-testid="lineart-preview-mini"]')).not.toBeNull()
    expect(onApplyTrace).not.toHaveBeenCalled()

    const editIcon = document.body.querySelector(
      'button[aria-label="Edit parameters"]',
    ) as HTMLButtonElement
    fireEvent.click(editIcon)
    await waitFor(() => {
      expect(document.body.querySelector("#line_thickness")).not.toBeNull()
    })

    fireEvent.click(
      Array.from(document.body.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Preview",
      ) as HTMLButtonElement,
    )
    const applyIcon = document.body.querySelector(
      'button[aria-label="Apply filter"]',
    ) as HTMLButtonElement
    fireEvent.click(applyIcon)
    await waitFor(() => {
      expect(onApplyTrace).toHaveBeenCalledWith(expect.objectContaining({ kind: "lineart" }))
    })
  })
})
