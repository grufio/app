/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EditorViewBar } from "./editor-view-bar"

describe("EditorViewBar", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders the dark/light toggle and fires onToggle", () => {
    const onToggle = vi.fn()
    const { getByLabelText, rerender } = render(<EditorViewBar theme={{ value: "dark", onToggle }} />)
    fireEvent.click(getByLabelText("Switch to light theme"))
    expect(onToggle).toHaveBeenCalledTimes(1)
    rerender(<EditorViewBar theme={{ value: "light", onToggle }} />)
    expect(getByLabelText("Switch to dark theme")).not.toBeNull()
  })

  it("shows the Eye view-options only when viewOptions is provided", () => {
    const { queryByLabelText, rerender } = render(
      <EditorViewBar theme={{ value: "dark", onToggle: () => {} }} />,
    )
    expect(queryByLabelText("View options")).toBeNull()
    rerender(
      <EditorViewBar
        theme={{ value: "dark", onToggle: () => {} }}
        viewOptions={{
          traceOverlayVisible: true,
          previewBitmapVisible: true,
          numbersLayerVisible: true,
          onTraceOverlayChange: () => {},
          onPreviewBitmapChange: () => {},
          onNumbersLayerChange: () => {},
        }}
      />,
    )
    expect(queryByLabelText("View options")).not.toBeNull()
  })
})
