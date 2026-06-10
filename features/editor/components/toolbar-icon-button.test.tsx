/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { EditorToolbarToneProvider } from "./editor-toolbar-tone"
import { ToolbarIconButton } from "./toolbar-icon-button"

describe("ToolbarIconButton tone", () => {
  afterEach(() => cleanup())

  it("uses white ink by default (dark tone, no provider)", () => {
    const { getByLabelText } = render(
      <ToolbarIconButton label="Img">
        <span>i</span>
      </ToolbarIconButton>,
    )
    expect(getByLabelText("Img").className).toContain("text-white/70")
  })

  it("uses zinc-900 ink under a light-tone provider", () => {
    const { getByLabelText } = render(
      <EditorToolbarToneProvider tone="light">
        <ToolbarIconButton label="Img">
          <span>i</span>
        </ToolbarIconButton>
      </EditorToolbarToneProvider>,
    )
    expect(getByLabelText("Img").className).toContain("text-zinc-900/70")
    expect(getByLabelText("Img").className).not.toContain("text-white/70")
  })

  it("brightens the active icon to the full tone ink", () => {
    const { getByLabelText } = render(
      <EditorToolbarToneProvider tone="light">
        <ToolbarIconButton label="Img" active>
          <span>i</span>
        </ToolbarIconButton>
      </EditorToolbarToneProvider>,
    )
    expect(getByLabelText("Img").className).toContain("text-zinc-900")
  })

  it("honours an explicit tone prop over the context", () => {
    const { getByLabelText } = render(
      <EditorToolbarToneProvider tone="light">
        <ToolbarIconButton label="Img" tone="dark">
          <span>i</span>
        </ToolbarIconButton>
      </EditorToolbarToneProvider>,
    )
    expect(getByLabelText("Img").className).toContain("text-white/70")
  })
})
