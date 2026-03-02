import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { SidebarProvider } from "@/components/ui/sidebar"
import { FilterSidebarSection } from "./filter-sidebar-section"

describe("FilterSidebarSection", () => {
  it("renders filter entries and add action", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        SidebarProvider,
        null,
        React.createElement(FilterSidebarSection, {
          filterStack: [
            { id: "f1", filterType: "pixelate" },
            { id: "f2", filterType: "lineart" },
          ],
          canvasMode: "filter",
          hiddenFilterIds: {},
          isAddFilterDisabled: false,
          activeDisplayFilterId: "f2",
          isActiveDisplayFilterHidden: false,
          isRemovingFilter: false,
          onSelectFilter: vi.fn(),
          onToggleHidden: vi.fn(),
          onRemoveFilter: vi.fn(),
          onOpenSelection: vi.fn(),
        })
      )
    )

    expect(html).toContain("Pixelate")
    expect(html).toContain("Line Art")
    expect(html).toContain("aria-label=\"Add filter\"")
  })

  it("disables add action when requested", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        SidebarProvider,
        null,
        React.createElement(FilterSidebarSection, {
          filterStack: [],
          canvasMode: "image",
          hiddenFilterIds: {},
          isAddFilterDisabled: true,
          activeDisplayFilterId: null,
          isActiveDisplayFilterHidden: false,
          isRemovingFilter: false,
          onSelectFilter: vi.fn(),
          onToggleHidden: vi.fn(),
          onRemoveFilter: vi.fn(),
          onOpenSelection: vi.fn(),
        })
      )
    )

    expect(html).toContain("aria-label=\"Add filter\"")
    expect(html).toContain("disabled")
  })
})
