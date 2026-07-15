/**
 * @vitest-environment jsdom
 *
 * Smoke test for TraceSelectionController — the trace tile picker. Verifies the
 * desktop and mobile (fullscreen) layouts both render the trace cards, keep
 * Select disabled until a card is chosen, and fire onSelect with the id.
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TraceSelectionController } from "./TraceSelectionController"

function stubMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) =>
    ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia
}

function findButton(text: string) {
  return Array.from(document.body.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined
}

describe("TraceSelectionController (smoke)", () => {
  afterEach(() => {
    cleanup()
  })

  function renderPicker() {
    const onSelect = vi.fn()
    render(
      <TraceSelectionController
        workingImageUrl={null}
        open
        onClose={() => {}}
        onSelect={onSelect}
      />,
    )
    return onSelect
  }

  it("desktop: renders the trace cards; Select fires onSelect with the chosen id", async () => {
    stubMatchMedia(false)
    const onSelect = renderPicker()

    await waitFor(() => {
      expect(document.body.querySelectorAll("button[aria-pressed]").length).toBe(3)
    })

    expect(findButton("Select")?.disabled).toBe(true)

    fireEvent.click(document.body.querySelector('button[aria-label="Pixelate"]') as HTMLButtonElement)
    expect(findButton("Select")?.disabled).toBe(false)

    fireEvent.click(findButton("Select") as HTMLButtonElement)
    expect(onSelect).toHaveBeenCalledWith("pixelate")
  })

  it("mobile: fullscreen layout renders cards + sticky Cancel/Select", async () => {
    stubMatchMedia(true)
    const onSelect = renderPicker()

    await waitFor(() => {
      expect(document.body.querySelectorAll("button[aria-pressed]").length).toBe(3)
    })
    expect(findButton("Cancel")).toBeTruthy()
    expect(findButton("Select")?.disabled).toBe(true)

    fireEvent.click(document.body.querySelector('button[aria-label="Pixelate"]') as HTMLButtonElement)
    fireEvent.click(findButton("Select") as HTMLButtonElement)
    expect(onSelect).toHaveBeenCalledWith("pixelate")
  })
})
