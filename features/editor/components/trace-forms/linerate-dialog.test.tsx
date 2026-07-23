/**
 * @vitest-environment jsdom
 *
 * Behaviour test for LinerateDialog's server-preview lifecycle:
 *  - The Preview button is hidden while the draft matches the last-previewed
 *    params (initially the OPENING params) — an untouched dialog offers no
 *    Preview; it appears after a change and hides again once previewed.
 *  - The preview runs on the current draft each time Preview is tapped
 *    (generation-driven re-run, no remount).
 * The opt-in props (`canPreview` / `onPreviewRequested` / `generation`) are what
 * drive this; pixelate/circulate don't pass them and keep their old behaviour
 * (covered by pixelate-dialog.test.tsx).
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

  function renderDialog(onPreviewTrace: () => Promise<string>) {
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
      />,
    )
  }

  it("hides Preview until a change, runs it on the changed draft, then hides again", async () => {
    const onPreviewTrace = vi.fn(async () => SVG)
    renderDialog(onPreviewTrace)

    // Opens on the params overlay. Nothing changed from the opening params →
    // the Preview button is NOT offered.
    await waitFor(() => {
      expect(document.body.querySelector("#min_paintable_mm")).not.toBeNull()
    })
    expect(findButton("Preview")).toBeUndefined()

    // Change the Min-gap field → the draft is dirty → Preview is offered.
    const gap = document.body.querySelector("#min_paintable_mm") as HTMLInputElement
    gap.focus()
    fireEvent.change(gap, { target: { value: "6" } })
    fireEvent.blur(gap)
    const preview = await waitFor(() => {
      const b = findButton("Preview")
      if (!b) throw new Error("Preview not offered after change")
      return b
    })

    // Tap Preview → the pane runs the server preview once with the current draft.
    fireEvent.click(preview)
    await waitFor(() => {
      expect(onPreviewTrace).toHaveBeenCalledTimes(1)
    })
    expect(onPreviewTrace).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "linerate", params: expect.any(Object) }),
    )

    // Re-open the params (pencil). Nothing changed since the preview → the
    // Preview button is hidden again.
    fireEvent.click(document.body.querySelector('button[aria-label="Edit parameters"]') as HTMLButtonElement)
    await waitFor(() => {
      expect(document.body.querySelector("#min_paintable_mm")).not.toBeNull()
    })
    expect(findButton("Preview")).toBeUndefined()
  })

  it("re-offers Preview after a further change and re-runs on the new draft", async () => {
    const onPreviewTrace = vi.fn(async () => SVG)
    renderDialog(onPreviewTrace)

    await waitFor(() => {
      expect(document.body.querySelector("#min_paintable_mm")).not.toBeNull()
    })

    const changeGap = (value: string) => {
      const gap = document.body.querySelector("#min_paintable_mm") as HTMLInputElement
      gap.focus()
      fireEvent.change(gap, { target: { value } })
      fireEvent.blur(gap)
    }
    const tapPreview = async (times: number) => {
      const b = await waitFor(() => {
        const btn = findButton("Preview")
        if (!btn) throw new Error("Preview button not offered")
        return btn
      })
      fireEvent.click(b)
      await waitFor(() => {
        expect(onPreviewTrace).toHaveBeenCalledTimes(times)
      })
    }

    // A change enables the first preview (an untouched dialog offers none).
    changeGap("6")
    await tapPreview(1)

    // Back to params, change again → Preview re-offered → second run
    // (generation bump, no remount).
    fireEvent.click(document.body.querySelector('button[aria-label="Edit parameters"]') as HTMLButtonElement)
    await waitFor(() => {
      expect(document.body.querySelector("#min_paintable_mm")).not.toBeNull()
    })
    changeGap("8")
    await tapPreview(2)
  })
})
