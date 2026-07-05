/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { NavIconButton } from "./nav-icon-button"

describe("NavIconButton", () => {
  afterEach(cleanup)

  it("exposes its label as aria-label + title and is not pressed by default", () => {
    const { getByLabelText } = render(
      <NavIconButton label="Next section">
        <svg />
      </NavIconButton>,
    )
    const btn = getByLabelText("Next section")
    expect(btn.getAttribute("title")).toBe("Next section")
    expect(btn.getAttribute("aria-pressed")).toBeNull()
  })

  it("marks active with aria-pressed and a filled chip background", () => {
    const { getByLabelText } = render(
      <NavIconButton label="Section: Trace" active>
        <svg />
      </NavIconButton>,
    )
    const btn = getByLabelText("Section: Trace")
    expect(btn.getAttribute("aria-pressed")).toBe("true")
    expect(btn.className).toContain("bg-neutral-700")
  })

  it("honours a custom chip surface (reused by the tools bar's lighter chip)", () => {
    const { getByLabelText } = render(
      <NavIconButton label="Hand" active chipClassName="bg-neutral-600">
        <svg />
      </NavIconButton>,
    )
    const btn = getByLabelText("Hand")
    expect(btn.className).toContain("bg-neutral-600")
    expect(btn.className).not.toContain("bg-neutral-700")
  })

  it("disables the button and swallows clicks via the disabled prop", () => {
    const onClick = vi.fn()
    const { getByLabelText } = render(
      <NavIconButton label="Previous section" disabled onClick={onClick}>
        <svg />
      </NavIconButton>,
    )
    const btn = getByLabelText("Previous section") as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })
})
