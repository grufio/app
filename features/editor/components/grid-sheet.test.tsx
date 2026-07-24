/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { installMatchMedia } from "@/lib/test/jsdom-stubs"

import { GridSheet } from "./grid-sheet"

// The GridPanel is loaded via next/dynamic and pulls in canvas plumbing;
// stub it so the swap (Add-row ↔ panel) and close wiring are testable.
vi.mock("./grid-panel", () => ({
  GridPanel: ({ onDelete }: { onDelete: () => void }) => (
    <div data-testid="grid-panel">
      <button type="button" aria-label="delete-grid" onClick={onDelete} />
    </div>
  ),
}))

afterEach(cleanup)

function renderSheet(overrides: Partial<React.ComponentProps<typeof GridSheet>> = {}) {
  const props = {
    onClose: vi.fn(),
    hasGrid: false,
    gridVisible: true,
    onGridVisibleChange: vi.fn(),
    onGridCreateRequested: vi.fn(),
    onGridDeleteRequested: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<GridSheet {...props} />) }
}

describe("GridSheet", () => {
  beforeEach(() => installMatchMedia(false))

  it("shows the Add-Grid row when no grid exists", () => {
    const { props, getByLabelText, queryByTestId } = renderSheet({ hasGrid: false })
    expect(queryByTestId("grid-panel")).toBeNull()
    fireEvent.click(getByLabelText("Add Grid"))
    expect(props.onGridCreateRequested).toHaveBeenCalledTimes(1)
  })

  it("shows the GridPanel when a grid exists", async () => {
    // GridPanel is code-split via next/dynamic — it resolves a tick after render.
    const { props, getByLabelText, findByTestId } = renderSheet({ hasGrid: true })
    expect(await findByTestId("grid-panel")).not.toBeNull()
    fireEvent.click(getByLabelText("delete-grid"))
    expect(props.onGridDeleteRequested).toHaveBeenCalledTimes(1)
  })

  it("closes via the header button", () => {
    const { props, getByLabelText } = renderSheet()
    fireEvent.click(getByLabelText("Close"))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })
})
