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

  // Regression: tapping Preview to close the edit dialog must flush any
  // pending field commit first, otherwise the user's typed value never
  // reaches the parent's draft and the outer fullscreen preview keeps
  // rendering the pre-edit params (looks like "no adjustment took effect").
  it("mobile: a typed numeric value is committed before Preview closes the edit dialog", async () => {
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

    await waitFor(() => {
      expect(document.body.querySelector('[data-testid="pixelate-preview-mini"]')).not.toBeNull()
    })
    const editIcon = document.body.querySelector(
      'button[aria-label="Edit parameters"]',
    ) as HTMLButtonElement
    fireEvent.click(editIcon)
    const input = await waitFor(() => {
      const el = document.body.querySelector("#supercell_width_mm") as HTMLInputElement | null
      if (!el) throw new Error("input not mounted")
      return el
    })

    // Type a value the user definitely didn't have before. No explicit
    // blur — the user just taps Preview, which is what fires the bug.
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "7.5" } })
    const preview = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Preview",
    ) as HTMLButtonElement
    fireEvent.click(preview)
    await waitFor(() => {
      expect(document.body.querySelector("#supercell_width_mm")).toBeNull()
    })

    // The typed 7.5 must reach the parent draft. Verified via the apply
    // payload — the outer preview reads the same draft, so this also
    // proves the fullscreen preview reflects the edit.
    const applyIcon = document.body.querySelector(
      'button[aria-label="Apply filter"]',
    ) as HTMLButtonElement
    fireEvent.click(applyIcon)
    await waitFor(() => {
      expect(onApplyTrace).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "pixelate",
          params: expect.objectContaining({ supercell_width_mm: 7.5 }),
        }),
      )
    })
  })

  // Regression: tapping Preview to close the inner edit dialog must NOT
  // cascade-close the outer fullscreen preview. Nested Radix Dialogs (inner
  // Portal sibling to outer Portal) can confuse the outer's DismissableLayer
  // into treating clicks inside the inner as "outside" the outer — dismissing
  // the whole trace flow and dumping the user back into the editor.
  it("mobile: tapping Preview keeps the outer fullscreen preview open (does not call onClose)", async () => {
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

    const onClose = vi.fn()
    render(
      <PixelateDialog
        open
        sourceImageUrl="https://example.test/img.png"
        displayMmW={100}
        displayMmH={75}
        onClose={onClose}
        onSuccess={() => {}}
        onApplyTrace={async () => {}}
      />,
    )

    await waitFor(() => {
      expect(document.body.querySelector('[data-testid="pixelate-preview-mini"]')).not.toBeNull()
    })
    const editIcon = document.body.querySelector(
      'button[aria-label="Edit parameters"]',
    ) as HTMLButtonElement
    fireEvent.click(editIcon)
    await waitFor(() => {
      expect(document.body.querySelector("#supercell_width_mm")).not.toBeNull()
    })

    const preview = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Preview",
    ) as HTMLButtonElement
    fireEvent.click(preview)

    // Inner closes (form gone) but outer must remain — onClose is the outer's
    // cancel hook; firing it would mean the whole trace flow ended.
    await waitFor(() => {
      expect(document.body.querySelector("#supercell_width_mm")).toBeNull()
    })
    expect(onClose).not.toHaveBeenCalled()
    expect(
      document.body.querySelector('[data-testid="pixelate-preview-mini"]'),
    ).not.toBeNull()
  })
})
