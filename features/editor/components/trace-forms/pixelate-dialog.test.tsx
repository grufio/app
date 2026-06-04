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

    // Settings first: the dialog opens on the params overlay — the form is
    // mounted, the preview is rendered underneath.
    await waitFor(() => {
      expect(document.body.querySelector("#supercell_width_mm")).not.toBeNull()
    })
    expect(document.body.querySelector('[data-testid="pixelate-preview-mini"]')).not.toBeNull()

    // "Preview" collapses the overlay to reveal the preview, WITHOUT firing the
    // trace — apply is committed exclusively from the outer apply icon.
    const preview = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Preview",
    ) as HTMLButtonElement
    expect(preview).toBeTruthy()
    fireEvent.click(preview)
    await waitFor(() => {
      expect(document.body.querySelector("#supercell_width_mm")).toBeNull()
    })
    expect(onApplyTrace).not.toHaveBeenCalled()

    // The pencil re-opens the params from the preview.
    const editIcon = document.body.querySelector(
      'button[aria-label="Edit parameters"]',
    ) as HTMLButtonElement
    fireEvent.click(editIcon)
    await waitFor(() => {
      expect(document.body.querySelector("#supercell_width_mm")).not.toBeNull()
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

    // Settings first → the form is mounted on open; no pencil click needed.
    const input = await waitFor(() => {
      const el = document.body.querySelector("#supercell_width_mm") as HTMLInputElement | null
      if (!el) throw new Error("input not mounted")
      return el
    })

    // Type a value the user definitely didn't have before. No explicit
    // blur — the user just taps Preview, which is what fires the bug.
    // `input.focus()` (not `fireEvent.focus`) so that `document.activeElement`
    // actually points to the input — the Preview button's defensive blur
    // relies on that to flush the in-progress draft before the form
    // unmounts.
    input.focus()
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

  // Regression: tapping Preview to collapse the edit overlay must NOT close
  // the whole trace flow. Structurally guaranteed since the edit surface
  // is now an in-content overlay (not a nested portaled Dialog), so there
  // is no DismissableLayer cascade to suppress — but the test keeps the
  // contract pinned in case anyone re-introduces a second Dialog later.
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

    // Settings first → form mounted on open.
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

  // Context-aware close: the header X has two meanings depending on the
  // mode. In edit mode it should collapse the overlay back to the
  // preview (NOT end the trace flow); in preview mode it ends the flow.
  it("mobile: edit-mode X collapses the overlay without ending the trace flow", async () => {
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

    // The edit overlay's X is labelled "Back to preview"; the preview
    // header's X is labelled "Close". Both render simultaneously in the
    // DOM but only the overlay's is reachable while editOpen=true.
    const backX = document.body.querySelector(
      'button[aria-label="Back to preview"]',
    ) as HTMLButtonElement
    expect(backX).toBeTruthy()
    fireEvent.click(backX)

    await waitFor(() => {
      expect(document.body.querySelector("#supercell_width_mm")).toBeNull()
    })
    expect(onClose).not.toHaveBeenCalled()
    expect(
      document.body.querySelector('[data-testid="pixelate-preview-mini"]'),
    ).not.toBeNull()
  })
})
