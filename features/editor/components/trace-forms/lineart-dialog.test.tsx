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
  kMeansOklab: () => ({ centroids: [[0.5, 0, 0]], assignments: new Uint16Array(32 * 24) }),
  snapCentroidsToPalette: () => [{ r: 128, g: 128, b: 128 }],
  paintQuantizedToCanvas: () => {
    /* noop in jsdom */
  },
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

  it("renders preview canvas + form inputs + Apply/Cancel when open (desktop)", async () => {
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

    await waitFor(() => {
      expect(document.body.querySelector('[data-testid="lineart-preview-mini"]')).not.toBeNull()
    })
    expect(document.body.querySelector("#line_thickness")).not.toBeNull()
    expect(document.body.querySelector("#blur_amount")).not.toBeNull()
    expect(document.body.querySelector("#smoothness")).not.toBeNull()
    expect(document.body.querySelector("#color_mode")).not.toBeNull()
    expect(document.body.querySelector("#num_colors")).not.toBeNull()

    const buttons = Array.from(document.body.querySelectorAll("button"))
    const cancel = buttons.find((b) => b.textContent?.trim() === "Cancel")
    const apply = buttons.find((b) => b.textContent?.trim().startsWith("Apply"))
    expect(cancel).toBeTruthy()
    expect(apply).toBeTruthy()
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
    expect(document.body.querySelector('[data-testid="lineart-preview-mini"]')).not.toBeNull()

    const preview = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Preview",
    ) as HTMLButtonElement
    expect(preview).toBeTruthy()
    fireEvent.click(preview)
    await waitFor(() => {
      expect(document.body.querySelector("#line_thickness")).toBeNull()
    })
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
