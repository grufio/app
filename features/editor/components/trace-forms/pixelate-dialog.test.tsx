/**
 * @vitest-environment jsdom
 *
 * Smoke test for PixelateDialog. Detailed wiring assertions live in
 * pixelate-preview-pane.test.tsx and pixelate-form.test.tsx; this
 * test only verifies that the Dialog composes the three sub-pieces
 * (preview canvas + form + Apply/Cancel buttons) when open.
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/editor/trace/pixelate-preview", () => ({
  buildMiniCanvas: () => {
    /* noop in jsdom */
  },
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}))

import { FakeImage, FakeResizeObserver } from "@/lib/test/jsdom-stubs"
import { PixelateDialog } from "./pixelate-dialog"

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
    expect(document.body.querySelector("#color_mode")).not.toBeNull()

    const buttons = Array.from(document.body.querySelectorAll("button"))
    const cancel = buttons.find((b) => b.textContent?.trim() === "Cancel")
    const apply = buttons.find((b) => b.textContent?.trim().startsWith("Apply"))
    expect(cancel).toBeTruthy()
    expect(apply).toBeTruthy()
  })

  it("mobile: edit icon opens params; Preview returns to preview; apply icon fires the trace", async () => {
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
      <PixelateDialog
        open
        sourceImageUrl="https://example.test/img.png"
        displayMmW={100}
        displayMmH={75}
        onClose={() => {}}
        onSuccess={() => {}}
        onApplyTrace={onApplyTrace}
      />,
    )

    // Outer fullscreen: preview + edit + apply icons, but the form is NOT
    // mounted yet (the edit dialog is closed).
    await waitFor(() => {
      expect(document.body.querySelector('[data-testid="pixelate-preview-mini"]')).not.toBeNull()
    })
    const editIcon = document.body.querySelector(
      'button[aria-label="Edit parameters"]',
    ) as HTMLButtonElement | null
    const applyIcon = document.body.querySelector(
      'button[aria-label="Apply filter"]',
    ) as HTMLButtonElement | null
    expect(editIcon).toBeTruthy()
    expect(applyIcon).toBeTruthy()
    expect(document.body.querySelector("#supercell_width_mm")).toBeNull()

    // Edit icon opens the params dialog with the form + Preview action.
    fireEvent.click(editIcon!)
    await waitFor(() => {
      expect(document.body.querySelector("#supercell_width_mm")).not.toBeNull()
    })
    const preview = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Preview",
    )
    expect(preview).toBeTruthy()

    // Preview returns to the outer preview WITHOUT firing the trace — the
    // apply step is committed exclusively from the outer apply icon.
    fireEvent.click(preview as HTMLButtonElement)
    await waitFor(() => {
      expect(document.body.querySelector("#supercell_width_mm")).toBeNull()
    })
    expect(onApplyTrace).not.toHaveBeenCalled()

    // Outer apply icon is what actually fires the trace.
    fireEvent.click(applyIcon!)
    await waitFor(() => {
      expect(onApplyTrace).toHaveBeenCalledWith(expect.objectContaining({ kind: "pixelate" }))
    })
  })
})
