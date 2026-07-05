/**
 * @vitest-environment jsdom
 *
 * Covers the deterministic stepper logic (active trigger, chevron bounds +
 * stepping). The dropdown open/select interaction is a Radix DropdownMenu —
 * unsupported in this jsdom setup (no PointerEvent polyfill) — and is covered
 * end-to-end in `e2e/editor.boot.spec.ts` (`gotoSection`), which drives it in
 * real Chromium.
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { EditorSection } from "@/lib/editor/editor-sections"
import { EditorSectionStepper } from "./editor-section-stepper"

function renderStepper(activeSection: EditorSection = "artboard", onSelectSection = vi.fn()) {
  const utils = render(<EditorSectionStepper activeSection={activeSection} onSelectSection={onSelectSection} />)
  return { onSelectSection, ...utils }
}

describe("EditorSectionStepper", () => {
  afterEach(cleanup)

  it("shows the active section in the middle trigger", () => {
    const { getByLabelText, getByTestId } = renderStepper("trace")
    expect(getByLabelText("Section: Trace")).not.toBeNull()
    expect(getByTestId("section-stepper-trigger")).not.toBeNull()
  })

  it("disables Previous on the first section and Next on the last", () => {
    const { getByLabelText, rerender } = renderStepper("artboard")
    expect((getByLabelText("Previous section") as HTMLButtonElement).disabled).toBe(true)
    expect((getByLabelText("Next section") as HTMLButtonElement).disabled).toBe(false)

    rerender(<EditorSectionStepper activeSection="colors" onSelectSection={() => {}} />)
    expect((getByLabelText("Previous section") as HTMLButtonElement).disabled).toBe(false)
    expect((getByLabelText("Next section") as HTMLButtonElement).disabled).toBe(true)
  })

  it("steps to the neighbouring section (pipeline order) via the chevrons", () => {
    const { getByLabelText, onSelectSection } = renderStepper("filter")
    fireEvent.click(getByLabelText("Previous section"))
    expect(onSelectSection).toHaveBeenLastCalledWith("image")
    fireEvent.click(getByLabelText("Next section"))
    expect(onSelectSection).toHaveBeenLastCalledWith("trace")
  })
})
