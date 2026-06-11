/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MobileImageSheet } from "./mobile-image-sheet"

// ImagePanel is loaded via next/dynamic and pulls in canvas plumbing;
// AddImageMenuAction wires the upload pipeline. Stub both so the swap
// (Add-row ↔ panel) and close wiring are testable in isolation.
vi.mock("./image-panel", () => ({
  ImagePanel: () => <div data-testid="image-panel" />,
}))
vi.mock("./add-image-menu-button", () => ({
  AddImageMenuAction: () => <button type="button" aria-label="add-image" />,
}))

afterEach(cleanup)

function renderSheet(overrides: Partial<React.ComponentProps<typeof MobileImageSheet>> = {}) {
  const props = {
    projectId: "p1",
    onClose: vi.fn(),
    hasMasterImage: false,
    onImageUploaded: vi.fn(),
    panelImageTxU: null,
    workspaceUnit: "cm" as const,
    imagePanelReady: true,
    imagePanelEnabled: true,
    imageLock: null,
    canFit: false,
    onFitToArtboard: vi.fn(),
    masterImageLoading: false,
    deleteBusy: false,
    restoreBusy: false,
    canvasRef: { current: null },
    onRequestRestore: vi.fn(),
    onRequestDelete: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<MobileImageSheet {...props} />) }
}

describe("MobileImageSheet", () => {
  it("shows the upload Add-row when no master image exists", () => {
    const { getByLabelText, queryByTestId } = renderSheet({ hasMasterImage: false })
    expect(queryByTestId("image-panel")).toBeNull()
    expect(getByLabelText("add-image")).not.toBeNull()
  })

  it("shows the ImagePanel when a master image exists", async () => {
    // ImagePanel is code-split via next/dynamic — it resolves a tick after render.
    const { findByTestId, queryByLabelText } = renderSheet({ hasMasterImage: true })
    expect(await findByTestId("image-panel")).not.toBeNull()
    expect(queryByLabelText("add-image")).toBeNull()
  })

  it("closes via the header button", () => {
    const { props, getByLabelText } = renderSheet()
    fireEvent.click(getByLabelText("Close"))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })
})
