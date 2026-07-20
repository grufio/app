/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi, type Mock } from "vitest"

import type { ProjectTrace } from "@/lib/api/project-trace"
import { useTracePalette } from "@/lib/editor/trace/use-trace-palette"

import { ColorsDialog } from "./colors-dialog"

vi.mock("@/lib/editor/trace/use-trace-palette", () => ({ useTracePalette: vi.fn() }))

const PALETTE = [
  { oklab: { L: 0, a: 0, b: 0 }, rgb: [255, 0, 0] as const, notation: "5R 4/14", color_name: "Red" },
  { oklab: { L: 0, a: 0, b: 0 }, rgb: [0, 0, 255] as const, notation: "5B 5/10", color_name: "Blue" },
]

function makeTrace(overrides: Partial<ProjectTrace> = {}): ProjectTrace {
  return {
    project_id: "p1",
    kind: "pixelate",
    params: { color_mode: "color" },
    output_image_id: "o1",
    base_image_id: null,
    palette_indices_used: [0, 1],
    display_x_px_u: "0",
    display_y_px_u: "0",
    display_width_px_u: "0",
    display_height_px_u: "0",
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
    ...overrides,
  }
}

describe("ColorsDialog", () => {
  afterEach(() => cleanup())

  it("does not render its content when closed", () => {
    ;(useTracePalette as unknown as Mock).mockReturnValue(PALETTE)
    const { queryByText } = render(<ColorsDialog open={false} onClose={vi.fn()} trace={makeTrace()} />)
    expect(queryByText("Colors")).toBeNull()
  })

  it("renders the title, the chips and a Close button; Close fires onClose", () => {
    ;(useTracePalette as unknown as Mock).mockReturnValue(PALETTE)
    const onClose = vi.fn()
    const { getByText, getByRole } = render(<ColorsDialog open onClose={onClose} trace={makeTrace()} />)
    expect(getByText("Colors")).toBeTruthy()
    expect(getByText("5R 4/14")).toBeTruthy()
    expect(getByText("5B 5/10")).toBeTruthy()
    fireEvent.click(getByRole("button", { name: "Close" }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("shows the empty state for a trace without a palette", () => {
    ;(useTracePalette as unknown as Mock).mockReturnValue(PALETTE)
    const { getByText } = render(
      <ColorsDialog open onClose={vi.fn()} trace={makeTrace({ palette_indices_used: null })} />,
    )
    expect(getByText("Re-run this trace to capture its referenced colors.")).toBeTruthy()
  })
})
