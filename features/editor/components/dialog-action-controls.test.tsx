/**
 * @vitest-environment jsdom
 *
 * The two pieces now self-select by viewport via `useIsMobile()` — exactly one
 * is mounted at a time (no CSS `md:` toggling). So each block installs the
 * matching `matchMedia`: the header-icon cases render as MOBILE
 * (`installMatchMedia(true)`), the footer-text cases as DESKTOP
 * (`installMatchMedia(false)`).
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { Check, Trash2 } from "lucide-react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { installMatchMedia } from "@/lib/test/jsdom-stubs"

import { DialogFooterActions, DialogHeaderActions, type DialogAction } from "./dialog-action-controls"

afterEach(cleanup)

function makeActions(overrides: Partial<DialogAction>[] = []): DialogAction[] {
  const base: DialogAction[] = [
    { id: "delete", label: "Delete", ariaLabel: "Delete trace", icon: <Trash2 />, onClick: vi.fn(), variant: "ghost" },
    { id: "apply", label: "Apply", ariaLabel: "Apply filter", icon: <Check />, onClick: vi.fn() },
  ]
  return base.map((a, i) => ({ ...a, ...overrides[i] }))
}

describe("DialogHeaderActions", () => {
  beforeEach(() => installMatchMedia(true)) // mobile → header icons render

  it("renders each action as an icon button (descriptive ariaLabel) plus a Close", () => {
    const onClose = vi.fn()
    const { getByLabelText } = render(<DialogHeaderActions actions={makeActions()} onClose={onClose} />)
    expect(getByLabelText("Delete trace")).toBeTruthy()
    expect(getByLabelText("Apply filter")).toBeTruthy()
    fireEvent.click(getByLabelText("Close"))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("fires an action's onClick", () => {
    const onClick = vi.fn()
    const { getByLabelText } = render(
      <DialogHeaderActions actions={makeActions([{}, { onClick }])} onClose={vi.fn()} />,
    )
    fireEvent.click(getByLabelText("Apply filter"))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("disables a busy action", () => {
    const { getByLabelText } = render(
      <DialogHeaderActions actions={makeActions([{}, { busy: true }])} onClose={vi.fn()} />,
    )
    expect((getByLabelText("Apply filter") as HTMLButtonElement).disabled).toBe(true)
  })

  it("renders only Close when there are no actions", () => {
    const { getByLabelText, queryByLabelText } = render(<DialogHeaderActions onClose={vi.fn()} />)
    expect(getByLabelText("Close")).toBeTruthy()
    expect(queryByLabelText("Apply filter")).toBeNull()
  })
})

describe("DialogFooterActions", () => {
  beforeEach(() => installMatchMedia(false)) // desktop → footer text renders

  it("renders each action as a written-out text button and fires onClick", () => {
    const onClick = vi.fn()
    const { getByRole } = render(<DialogFooterActions actions={makeActions([{}, { onClick }])} />)
    // Accessible name is the concise `label`, not the descriptive ariaLabel.
    expect(getByRole("button", { name: "Delete" })).toBeTruthy()
    fireEvent.click(getByRole("button", { name: "Apply" }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("renders nothing when there are no actions", () => {
    const { container } = render(<DialogFooterActions actions={[]} />)
    expect(container.firstChild).toBeNull()
  })
})

// Regression fence for the "render once" contract: the piece for the OTHER
// viewport must not be in the DOM at all (not merely CSS-hidden). This is what
// prevents the duplicated / ghosted action buttons.
describe("render-once (single representation per viewport)", () => {
  it("desktop: header renders only Close, no action icons", () => {
    installMatchMedia(false)
    const { getByLabelText, queryByLabelText } = render(
      <DialogHeaderActions actions={makeActions()} onClose={vi.fn()} />,
    )
    expect(getByLabelText("Close")).toBeTruthy()
    expect(queryByLabelText("Apply filter")).toBeNull()
    expect(queryByLabelText("Delete trace")).toBeNull()
  })

  it("mobile: footer renders nothing", () => {
    installMatchMedia(true)
    const { container } = render(<DialogFooterActions actions={makeActions()} />)
    expect(container.firstChild).toBeNull()
  })
})
