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
  buildCirculateMiniCanvas: () => {
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

  it("renders preview canvas + form inputs + Apply/Cancel when open", async () => {
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

    await waitFor(() => {
      expect(document.body.querySelector('[data-testid="circulate-preview-mini"]')).not.toBeNull()
    })
    expect(document.body.querySelector("#outer_width_mm")).not.toBeNull()
    expect(document.body.querySelector("#inner_enabled")).not.toBeNull()
    expect(document.body.querySelector("#color_mode")).not.toBeNull()

    const buttons = Array.from(document.body.querySelectorAll("button"))
    const cancel = buttons.find((b) => b.textContent?.trim() === "Cancel")
    const apply = buttons.find((b) => b.textContent?.trim().startsWith("Apply"))
    expect(cancel).toBeTruthy()
    expect(apply).toBeTruthy()
  })

  it("mobile: shows preview + Bearbeiten; the params open in a separate dialog", async () => {
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

    await waitFor(() => {
      expect(document.body.querySelector('[data-testid="circulate-preview-mini"]')).not.toBeNull()
    })
    const edit = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Bearbeiten",
    )
    expect(edit).toBeTruthy()
    expect(document.body.querySelector("#outer_width_mm")).toBeNull()

    fireEvent.click(edit as HTMLButtonElement)
    await waitFor(() => {
      expect(document.body.querySelector("#outer_width_mm")).not.toBeNull()
    })
    const apply = Array.from(document.body.querySelectorAll("button")).find((b) =>
      b.textContent?.trim().startsWith("Anwenden"),
    )
    expect(apply).toBeTruthy()

    fireEvent.click(apply as HTMLButtonElement)
    await waitFor(() => {
      expect(onApplyTrace).toHaveBeenCalledWith(expect.objectContaining({ kind: "circulate" }))
    })
  })
})
