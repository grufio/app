/**
 * @vitest-environment jsdom
 *
 * Smoke test for CirculateDialog. Detailed wiring lives in
 * circulate-form.test.tsx / circulate-preview-pane.test.tsx; this only
 * verifies the dialog composes the three sub-pieces (preview canvas + form +
 * Apply/Cancel) when open.
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/editor/trace/circulate-preview", () => ({
  restrictOuterPalette: (args: { palette: unknown }) => args.palette,
  snapAndDitherOuter: () => null,
  applyTopNReductionOuter: () => null,
  snapInnerCells: () => null,
  paintCirculateCells: () => {
    /* noop in jsdom */
  },
}))

vi.mock("@/lib/editor/trace/pixelate-preview", () => ({
  readSourceCells: () => null,
  applyTextureStep: () => null,
}))

vi.mock("@/lib/editor/trace/use-trace-palette", () => ({
  useTracePalette: () => null,
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}))

import { FakeImage, FakeResizeObserver } from "@/lib/test/jsdom-stubs"
import { CirculateDialog } from "./circulate-dialog"

describe("CirculateDialog (smoke)", () => {
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
      <CirculateDialog
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
      expect(document.body.querySelector("#outer_width_mm")).not.toBeNull()
    })
    expect(document.body.querySelector("#inner_enabled")).not.toBeNull()
    expect(document.body.querySelector("#color_mode")).not.toBeNull()
    expect(document.body.querySelector('[data-testid="circulate-preview-mini"]')).toBeNull()

    const buttons = Array.from(document.body.querySelectorAll("button"))
    expect(buttons.find((b) => b.textContent?.trim() === "Cancel")).toBeTruthy()
    expect(buttons.find((b) => b.textContent?.trim() === "Preview")).toBeTruthy()
    expect(document.body.querySelector('button[aria-label="Apply filter"]')).not.toBeNull()
  })

  it("mobile: opens on params; Preview reveals preview; pencil re-opens; apply icon fires the trace", async () => {
    window.matchMedia = ((query: string) =>
      ({
        matches: false,
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
      <CirculateDialog
        open
        sourceImageUrl="https://example.test/img.png"
        displayMmW={100}
        displayMmH={75}
        onClose={() => {}}
        onSuccess={() => {}}
        onApplyTrace={onApplyTrace}
      />,
    )

    // Settings first: the dialog opens on the params overlay; only the
    // form is mounted. Preview pane is lazy — mounts on first Preview tap.
    await waitFor(() => {
      expect(document.body.querySelector("#outer_width_mm")).not.toBeNull()
    })
    expect(document.body.querySelector('[data-testid="circulate-preview-mini"]')).toBeNull()

    // "Preview" mounts the preview pane and collapses the overlay
    // WITHOUT firing the trace.
    const preview = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Preview",
    ) as HTMLButtonElement
    expect(preview).toBeTruthy()
    fireEvent.click(preview)
    await waitFor(() => {
      expect(document.body.querySelector("#outer_width_mm")).toBeNull()
    })
    expect(document.body.querySelector('[data-testid="circulate-preview-mini"]')).not.toBeNull()
    expect(onApplyTrace).not.toHaveBeenCalled()

    // The pencil re-opens the params from the preview.
    const editIcon = document.body.querySelector(
      'button[aria-label="Edit parameters"]',
    ) as HTMLButtonElement
    fireEvent.click(editIcon)
    await waitFor(() => {
      expect(document.body.querySelector("#outer_width_mm")).not.toBeNull()
    })

    // Collapse again, then the outer apply icon fires the trace.
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
      expect(onApplyTrace).toHaveBeenCalledWith(expect.objectContaining({ kind: "circulate" }))
    })
  })
})
