/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ImageSheet } from "./image-sheet"

// ImagePanel is loaded via next/dynamic and pulls in canvas plumbing;
// AddImageMenuAction wires the upload pipeline; the artboard/page panels
// read the workspace providers. Stub them all so the swap (Add-row ↔
// panels) and the standard SheetHeader close wiring are testable in isolation.
vi.mock("./image-panel", () => ({
  ImagePanel: () => <div data-testid="image-panel" />,
}))
vi.mock("./add-image-menu-button", () => ({
  AddImageMenuAction: () => <button type="button" aria-label="add-image" />,
}))
vi.mock("./artboard-panel", () => ({
  ArtboardPanel: () => <div data-testid="artboard-panel" />,
}))
vi.mock("./padding-section", () => ({
  PaddingSection: () => <div data-testid="padding-section" />,
}))
vi.mock("./page-background-section", () => ({
  PageBackgroundSection: () => <div data-testid="page-background-section" />,
}))

afterEach(cleanup)

function renderSheet(overrides: Partial<React.ComponentProps<typeof ImageSheet>> = {}) {
  const props = {
    projectId: "p1",
    onClose: vi.fn(),
    hasMasterImage: false,
    onImageUploaded: vi.fn(),
    panelImageTxU: null,
    workspaceUnit: "cm" as const,
    imagePanelReady: true,
    imagePanelEnabled: true,
    imageLocked: false,
    canFit: false,
    onFitToArtboard: vi.fn(),
    masterImageLoading: false,
    deleteBusy: false,
    restoreBusy: false,
    canvasRef: { current: null },
    onRequestRestore: vi.fn(),
    pageBgEnabled: false,
    pageBgColor: "#ffffff",
    pageBgOpacity: 1,
    onPageBgEnabledChange: vi.fn(),
    onPageBgColorChange: vi.fn(),
    onPageBgOpacityChange: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<ImageSheet {...props} />) }
}

describe("ImageSheet", () => {
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

  it("renders the standard SheetHeader with the 'Image' title", () => {
    const { getByRole } = renderSheet({ hasMasterImage: true })
    expect(getByRole("heading", { name: "Image" })).not.toBeNull()
  })

  it("closes via the SheetHeader Close button", () => {
    const { props, getByLabelText } = renderSheet()
    fireEvent.click(getByLabelText("Close"))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })
})
