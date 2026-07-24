/**
 * @vitest-environment jsdom
 *
 * Behaviour test for LinerateDialog's server-preview lifecycle:
 *  - NEW trace (no `initialParams`, nothing applied yet): Preview is ENABLED on
 *    open — you must be able to preview before the first apply (incl. right after
 *    deleting a trace). It disables once previewed and re-enables on a change.
 *  - EDITING an existing trace (`initialParams` present): Preview is DISABLED
 *    while the draft matches the applied params (re-previewing the applied result
 *    is pointless); it enables on a real change.
 *  - The preview runs on the current draft each time Preview is tapped
 *    (generation-driven re-run, no remount).
 * The opt-in props (`canPreview` / `onPreviewRequested` / `generation`) drive
 * this; pixelate/circulate don't pass them (covered by pixelate-dialog.test.tsx).
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}))

import { FakeImage, FakeResizeObserver } from "@/lib/test/jsdom-stubs"
import { LinerateDialog } from "./linerate-dialog"

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10H0z" fill="#fff"/></svg>'

function findButton(label: string): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined
}

function changeGap(value: string) {
  const gap = document.body.querySelector("#min_paintable_mm") as HTMLInputElement
  gap.focus()
  fireEvent.change(gap, { target: { value } })
  fireEvent.blur(gap)
}

describe("LinerateDialog — server preview lifecycle", () => {
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

  function renderDialog(onPreviewTrace: () => Promise<string>, initialParams?: Record<string, unknown>) {
    return render(
      <LinerateDialog
        open
        sourceImageUrl="https://example.test/img.png"
        displayMmW={100}
        displayMmH={75}
        onClose={() => {}}
        onSuccess={() => {}}
        onApplyTrace={async () => {}}
        onPreviewTrace={onPreviewTrace}
        initialParams={initialParams}
      />,
    )
  }

  it("enables Preview on a new trace, runs it, then disables until a change", async () => {
    const onPreviewTrace = vi.fn(async () => SVG)
    renderDialog(onPreviewTrace) // no initialParams → new-trace flow

    // Nothing applied yet → Preview is available immediately.
    await waitFor(() => {
      expect(document.body.querySelector("#min_paintable_mm")).not.toBeNull()
    })
    expect(findButton("Preview")?.disabled).toBe(false)

    // Tap Preview → the pane runs the server preview once with the current draft.
    fireEvent.click(findButton("Preview") as HTMLButtonElement)
    await waitFor(() => {
      expect(onPreviewTrace).toHaveBeenCalledTimes(1)
    })

    // Re-open the params (Edit). Nothing changed since the preview → disabled.
    // Default viewport is desktop → Edit is the footer text button.
    fireEvent.click(findButton("Edit") as HTMLButtonElement)
    await waitFor(() => {
      expect(document.body.querySelector("#min_paintable_mm")).not.toBeNull()
    })
    expect(findButton("Preview")?.disabled).toBe(true)

    // A change re-enables it.
    changeGap("6")
    await waitFor(() => {
      const b = findButton("Preview")
      if (!b || b.disabled) throw new Error("Preview not re-enabled after change")
    })
  })

  it("disables Preview for an unchanged existing trace, re-enables + runs on change", async () => {
    const onPreviewTrace = vi.fn(async () => SVG)
    // initialParams present → editing an already-applied trace.
    renderDialog(onPreviewTrace, { detail: 0.5, flatten: 0.4, min_paintable_mm: 4 })

    // Draft matches the applied params → Preview disabled.
    await waitFor(() => {
      expect(document.body.querySelector("#min_paintable_mm")).not.toBeNull()
    })
    expect(findButton("Preview")?.disabled).toBe(true)

    // Change → enabled → tap → runs on the new draft (generation bump).
    changeGap("8")
    const preview = await waitFor(() => {
      const b = findButton("Preview")
      if (!b || b.disabled) throw new Error("Preview not enabled after change")
      return b
    })
    fireEvent.click(preview)
    await waitFor(() => {
      expect(onPreviewTrace).toHaveBeenCalledTimes(1)
    })
  })
})
