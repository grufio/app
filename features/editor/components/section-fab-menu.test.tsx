/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { Grid2x2, Pencil } from "lucide-react"
import { useRef } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SectionFabMenu, type FabMenuItem } from "./section-fab-menu"

function Harness({
  items,
  onOpenChange = () => {},
  closeOnSelect,
  closeOnDelete,
}: {
  items: FabMenuItem[]
  onOpenChange?: (open: boolean) => void
  closeOnSelect?: boolean
  closeOnDelete?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref}>
      <SectionFabMenu
        open
        onOpenChange={onOpenChange}
        containerRef={ref}
        items={items}
        labels={{ add: "Add", close: "Close" }}
        deleteLabel="Delete"
        closeOnSelect={closeOnSelect}
        closeOnDelete={closeOnDelete}
      />
    </div>
  )
}

const selectable: FabMenuItem = { key: "a", label: "Alpha", Icon: Grid2x2, active: false }

describe("SectionFabMenu", () => {
  afterEach(() => cleanup())

  it("renders a selectable frame that fires onSelect", () => {
    const onSelect = vi.fn()
    const { getByLabelText } = render(<Harness items={[{ ...selectable, onSelect }]} />)
    fireEvent.click(getByLabelText("Alpha"))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it("honours closeOnSelect on a selectable tap", () => {
    const onOpenChange = vi.fn()
    const { getByLabelText } = render(
      <Harness items={[{ ...selectable, onSelect: () => {} }]} closeOnSelect onOpenChange={onOpenChange} />,
    )
    fireEvent.click(getByLabelText("Alpha"))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("renders an active row with lead + delete; lead honours closeOnSelect", () => {
    const onLead = vi.fn()
    const onOpenChange = vi.fn()
    const item: FabMenuItem = {
      key: "a",
      label: "Alpha",
      Icon: Grid2x2,
      active: true,
      lead: { icon: Pencil, label: "Edit", onClick: onLead },
      onDelete: () => {},
    }
    const { getByLabelText } = render(<Harness items={[item]} closeOnSelect onOpenChange={onOpenChange} />)
    // active glyph is a non-button indicator
    expect(getByLabelText("Alpha").tagName).not.toBe("BUTTON")
    fireEvent.click(getByLabelText("Edit"))
    expect(onLead).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("omits the lead and delete circles when not provided", () => {
    const { getByLabelText, queryByLabelText } = render(
      <Harness items={[{ key: "a", label: "Alpha", Icon: Grid2x2, active: true }]} />,
    )
    expect(getByLabelText("Alpha")).not.toBeNull()
    expect(queryByLabelText("Delete")).toBeNull()
  })

  it("shows the delete spinner even when onDelete is synchronous", async () => {
    // Mirrors filter's removeFilter (a sync state-machine event). Without the
    // minimum-duration floor the spinner would flip on→off in one paint and
    // never render — this is the regression guard for "animation everywhere".
    const onDelete = vi.fn()
    const { getByLabelText } = render(
      <Harness items={[{ key: "a", label: "Alpha", Icon: Grid2x2, active: true, onDelete }]} />,
    )
    fireEvent.click(getByLabelText("Delete"))
    expect(onDelete).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(getByLabelText("Delete").querySelector(".animate-spin")).not.toBeNull()
    })
  })

  it("freezes the deleting row + spins even after the parent flips it inactive", async () => {
    let resolveDelete: () => void = () => {}
    const onDelete = vi.fn(() => new Promise<void>((r) => { resolveDelete = r }))
    const onOpenChange = vi.fn()
    const active: FabMenuItem = { key: "a", label: "Alpha", Icon: Grid2x2, active: true, onDelete }
    const { getByLabelText, rerender } = render(
      <Harness items={[active]} closeOnDelete onOpenChange={onOpenChange} />,
    )
    fireEvent.click(getByLabelText("Delete"))
    await waitFor(() => {
      expect(getByLabelText("Delete").querySelector(".animate-spin")).not.toBeNull()
    })
    // Parent flips the item inactive mid-delete (e.g. optimistic state update)
    // while the handler is still around. The deletingKey freeze keeps the row.
    rerender(
      <Harness
        items={[{ key: "a", label: "Alpha", Icon: Grid2x2, active: false, onDelete }]}
        closeOnDelete
        onOpenChange={onOpenChange}
      />,
    )
    // Still frozen as the active row with its spinner.
    expect(getByLabelText("Delete").querySelector(".animate-spin")).not.toBeNull()
    resolveDelete()
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })
})
