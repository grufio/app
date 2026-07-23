/**
 * @vitest-environment jsdom
 *
 * Behaviour test for LinerateDialog's server-preview lifecycle:
 *  - The preview runs on the current draft each time Preview is tapped
 *    (generation-driven re-run, no remount).
 *  - The Preview button hides while the draft still matches the last-previewed
 *    params, and reappears after any change.
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

  it("runs the preview on tap and hides the button until the draft changes", async () => {
    const onPreviewTrace = vi.fn(async () => SVG)
    renderDialog(onPreviewTrace)

    // Opens on the params overlay; the Preview button is offered (first preview
    // is always dirty).
    await waitFor(() => {
      expect(document.body.querySelector("#flatten")).not.toBeNull()
    })
    const preview = findButton("Preview")
    expect(preview).toBeTruthy()

    // Tap Preview → the pane mounts + runs the server preview once with the
    // current draft.
    fireEvent.click(preview as HTMLButtonElement)
    await waitFor(() => {
      expect(onPreviewTrace).toHaveBeenCalledTimes(1)
    })
    expect(onPreviewTrace).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "linerate", params: expect.any(Object) }),
    )

    // Re-open the params (pencil). Nothing changed since the preview → the
    // Preview button is hidden.
    fireEvent.click(document.body.querySelector('button[aria-label="Edit parameters"]') as HTMLButtonElement)
    await waitFor(() => {
      expect(document.body.querySelector("#flatten")).not.toBeNull()
    })
    expect(findButton("Preview")).toBeUndefined()
  })

  it("re-offers Preview after a change and re-runs on the new draft", async () => {
    const onPreviewTrace = vi.fn(async () => SVG)
    renderDialog(onPreviewTrace)

    await waitFor(() => {
      expect(document.body.querySelector("#min_paintable_mm")).not.toBeNull()
    })

    // First preview.
    fireEvent.click(findButton("Preview") as HTMLButtonElement)
    await waitFor(() => {
      expect(onPreviewTrace).toHaveBeenCalledTimes(1)
    })

    // Back to params, change the numeric Min-gap field (a real <input> that
    // commits on blur) → the draft is dirty → Preview is offered again.
    fireEvent.click(document.body.querySelector('button[aria-label="Edit parameters"]') as HTMLButtonElement)
    const gap = await waitFor(() => {
      const el = document.body.querySelector("#min_paintable_mm") as HTMLInputElement | null
      if (!el) throw new Error("min_paintable_mm input not re-mounted")
      return el
    })
    gap.focus()
    fireEvent.change(gap, { target: { value: "6" } })
    fireEvent.blur(gap)

    const preview2 = await waitFor(() => {
      const b = findButton("Preview")
      if (!b) throw new Error("Preview button not re-offered after change")
      return b
    })

    // Second tap → the pane re-runs (generation bump), no remount.
    fireEvent.click(preview2)
    await waitFor(() => {
      expect(onPreviewTrace).toHaveBeenCalledTimes(2)
    })
  })
})
