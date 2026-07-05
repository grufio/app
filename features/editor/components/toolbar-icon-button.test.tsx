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

describe("ToolbarIconButton active style", () => {
  afterEach(() => cleanup())

  it("default (ink) active adds no chip background", () => {
    const { getByLabelText } = render(
      <ToolbarIconButton label="Img" active>
        <span>i</span>
      </ToolbarIconButton>,
    )
    const cls = getByLabelText("Img").className
    expect(cls).not.toContain("bg-neutral-")
    expect(cls).toContain("hover:bg-transparent")
  })

  it("activeStyle=chip fills a grey chip and drops the transparent-hover", () => {
    const { getByLabelText } = render(
      <ToolbarIconButton label="Img" active activeStyle="chip">
        <span>i</span>
      </ToolbarIconButton>,
    )
    const cls = getByLabelText("Img").className
    expect(cls).toContain("bg-neutral-700")
    // chip keeps a filled (non-white, non-transparent) hover, not the ink-path transparent one.
    expect(cls).toContain("hover:bg-neutral-600")
  })

  it("chipClassName overrides the chip surface", () => {
    const { getByLabelText } = render(
      <ToolbarIconButton label="Img" active activeStyle="chip" chipClassName="bg-neutral-600">
        <span>i</span>
      </ToolbarIconButton>,
    )
    const cls = getByLabelText("Img").className
    expect(cls).toContain("bg-neutral-600")
    expect(cls).not.toContain("bg-neutral-700")
  })

  it("suppresses AppButton's purple focus-visible ring", () => {
    const { getByLabelText } = render(
      <ToolbarIconButton label="Img">
        <span>i</span>
      </ToolbarIconButton>,
    )
    const cls = getByLabelText("Img").className
    expect(cls).toContain("focus-visible:ring-0")
    expect(cls).not.toContain("focus-visible:ring-[3px]")
  })
})
