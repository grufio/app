import { describe, expect, it } from "vitest"

import { isSurfaceActive } from "./section-active"

describe("isSurfaceActive — desktop uses leftPanelTab", () => {
  it("filter surface active when leftPanelTab === 'filter'", () => {
    expect(
      isSurfaceActive({
        surface: "filter",
        isMobile: false,
        leftPanelTab: "filter",
        mobileSection: "artboard",
      }),
    ).toBe(true)
  })

  it("trace surface active when leftPanelTab === 'trace'", () => {
    expect(
      isSurfaceActive({
        surface: "trace",
        isMobile: false,
        leftPanelTab: "trace",
        mobileSection: "artboard",
      }),
    ).toBe(true)
  })

  it("image surface active when leftPanelTab === 'image'", () => {
    expect(
      isSurfaceActive({
        surface: "image",
        isMobile: false,
        leftPanelTab: "image",
        mobileSection: "artboard",
      }),
    ).toBe(true)
  })

  it("desktop ignores mobileSection", () => {
    expect(
      isSurfaceActive({
        surface: "trace",
        isMobile: false,
        leftPanelTab: "image",
        mobileSection: "trace",
      }),
    ).toBe(false)
  })

  it("returns false when on a different surface", () => {
    expect(
      isSurfaceActive({
        surface: "filter",
        isMobile: false,
        leftPanelTab: "image",
        mobileSection: "artboard",
      }),
    ).toBe(false)
  })
})

describe("isSurfaceActive — mobile uses mobileSection", () => {
  it("filter surface active when mobileSection === 'filter'", () => {
    expect(
      isSurfaceActive({
        surface: "filter",
        isMobile: true,
        leftPanelTab: "image",
        mobileSection: "filter",
      }),
    ).toBe(true)
  })

  it("trace surface active when mobileSection === 'trace'", () => {
    expect(
      isSurfaceActive({
        surface: "trace",
        isMobile: true,
        leftPanelTab: "image",
        mobileSection: "trace",
      }),
    ).toBe(true)
  })

  it("image surface maps to mobile's 'artboard' section", () => {
    expect(
      isSurfaceActive({
        surface: "image",
        isMobile: true,
        leftPanelTab: "trace",
        mobileSection: "artboard",
      }),
    ).toBe(true)
  })

  it("mobile ignores leftPanelTab", () => {
    expect(
      isSurfaceActive({
        surface: "trace",
        isMobile: true,
        leftPanelTab: "trace",
        mobileSection: "filter",
      }),
    ).toBe(false)
  })

  it("returns false when on a different mobile section", () => {
    expect(
      isSurfaceActive({
        surface: "filter",
        isMobile: true,
        leftPanelTab: "filter",
        mobileSection: "trace",
      }),
    ).toBe(false)
  })
})
