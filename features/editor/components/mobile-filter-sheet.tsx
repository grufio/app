"use client"

/**
 * Mobile full-screen Filter sheet.
 *
 * Surfaces what the desktop LEFT panel's Filter tab shows
 * (`FilterSidebarSection`) inside a scrollable mobile sheet, opened
 * via the Filter icon in the editor's bottom-nav. Same filter list,
 * same add / hide / remove actions, same "Add Filter" Radix-portal
 * dialog flow — the section is dropped in as-is.
 *
 * `FilterSidebarSection` uses `SidebarMenuButton` which expects a
 * `SidebarProvider` ancestor (`useSidebar()` throws otherwise). The
 * sheet body is wrapped in `SidebarFrame` (= `SidebarProvider`) so
 * the section finds its context.
 *
 * Render shape mirrors `MobileArtboardSheet`: `absolute inset-0`
 * overlay inside the editor layout container, header + scrollable
 * body, bottom-nav stays as a flex-sibling beneath the layout.
 */
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SidebarFrame } from "@/components/navigation/SidebarFrame"
import { SidebarContent } from "@/components/ui/sidebar"

import { FilterSidebarSection } from "./filter-sidebar-section"

export function MobileFilterSheet(props: {
  onClose: () => void
  filterStack: Array<{ id: string; filterType: string }>
  canvasMode: "image" | "filter"
  hiddenFilterIds: Record<string, boolean>
  isAddFilterDisabled: boolean
  activeDisplayFilterId: string | null
  isActiveDisplayFilterHidden: boolean
  isRemovingFilter: boolean
  isLoadingInitial?: boolean
  onSelectFilter: (filterId: string) => void
  onToggleHidden: (filterId: string) => void
  onRemoveFilter: (filterId: string) => void
  onOpenSelection: () => void
}) {
  const {
    onClose,
    filterStack,
    canvasMode,
    hiddenFilterIds,
    isAddFilterDisabled,
    activeDisplayFilterId,
    isActiveDisplayFilterHidden,
    isRemovingFilter,
    isLoadingInitial,
    onSelectFilter,
    onToggleHidden,
    onRemoveFilter,
    onOpenSelection,
  } = props

  return (
    <section
      aria-label="Filter"
      className="absolute inset-0 z-30 flex flex-col overflow-hidden bg-background md:hidden"
    >
      <header className="flex shrink-0 items-center justify-between border-b bg-background px-4 py-3">
        <h2 className="text-sm font-semibold">Filter</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close"
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-5" />
        </Button>
      </header>

      <SidebarFrame className="block min-h-0 flex-1">
        <SidebarContent className="gap-0">
          <FilterSidebarSection
            filterStack={filterStack}
            canvasMode={canvasMode}
            hiddenFilterIds={hiddenFilterIds}
            isAddFilterDisabled={isAddFilterDisabled}
            activeDisplayFilterId={activeDisplayFilterId}
            isActiveDisplayFilterHidden={isActiveDisplayFilterHidden}
            isRemovingFilter={isRemovingFilter}
            isLoadingInitial={isLoadingInitial}
            onSelectFilter={onSelectFilter}
            onToggleHidden={onToggleHidden}
            onRemoveFilter={onRemoveFilter}
            onOpenSelection={onOpenSelection}
          />
        </SidebarContent>
      </SidebarFrame>
    </section>
  )
}
