/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EditorHomeBar } from "./editor-home-bar"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

describe("EditorHomeBar", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders the Home button", () => {
    const { getByLabelText } = render(<EditorHomeBar />)
    expect(getByLabelText("Home")).not.toBeNull()
  })

  it("links Home to /dashboard", () => {
    const { getByLabelText } = render(<EditorHomeBar />)
    const home = getByLabelText("Home") as HTMLAnchorElement
    expect(home.tagName).toBe("A")
    expect(home.getAttribute("href")).toBe("/dashboard")
  })
})
