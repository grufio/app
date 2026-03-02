"use client"

import { Eye, EyeOff, Plus, SlidersHorizontal, Trash2 } from "lucide-react"

import { SidebarMenu, SidebarMenuAction, SidebarMenuActions, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { EditorSidebarSection } from "@/features/editor/components/sidebar/editor-sidebar-section"

function getFilterLabel(filterType: string): string {
  switch (filterType) {
    case "pixelate":
      return "Pixelate"
    case "lineart":
      return "Line Art"
    case "numerate":
      return "Numerate"
    default:
      return "Filter"
  }
}

export function FilterSidebarSection(props: {
  filterStack: Array<{ id: string; filterType: string }>
  canvasMode: "image" | "filter"
  hiddenFilterIds: Record<string, boolean>
  isAddFilterDisabled: boolean
  activeDisplayFilterId: string | null
  isActiveDisplayFilterHidden: boolean
  isRemovingFilter: boolean
  onSelectFilter: (filterId: string) => void
  onToggleHidden: (filterId: string) => void
  onRemoveFilter: (filterId: string) => void
  onOpenSelection: () => void
}) {
  const {
    filterStack,
    canvasMode,
    hiddenFilterIds,
    isAddFilterDisabled,
    activeDisplayFilterId,
    isActiveDisplayFilterHidden,
    isRemovingFilter,
    onSelectFilter,
    onToggleHidden,
    onRemoveFilter,
    onOpenSelection,
  } = props

  return (
    <EditorSidebarSection title="Filter">
      <SidebarMenu>
        {filterStack.map((filter) => (
          <SidebarMenuItem key={filter.id}>
            <SidebarMenuButton
              isActive={canvasMode === "filter" && !isActiveDisplayFilterHidden && activeDisplayFilterId === filter.id}
              className="text-xs font-medium"
              onClick={() => onSelectFilter(filter.id)}
            >
              <SlidersHorizontal />
              <span>{getFilterLabel(filter.filterType)}</span>
            </SidebarMenuButton>
            <SidebarMenuActions>
              <SidebarMenuAction
                inline
                aria-label={hiddenFilterIds[filter.id] ? "Show filter" : "Hide filter"}
                onClick={() => onToggleHidden(filter.id)}
              >
                {hiddenFilterIds[filter.id] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </SidebarMenuAction>
              <SidebarMenuAction
                inline
                aria-label="Remove filter"
                disabled={isRemovingFilter}
                onClick={() => onRemoveFilter(filter.id)}
              >
                <Trash2 />
              </SidebarMenuAction>
            </SidebarMenuActions>
          </SidebarMenuItem>
        ))}

        <SidebarMenuItem>
          <SidebarMenuButton className="text-xs font-medium" disabled>
            <SlidersHorizontal />
            <span>New Filter</span>
          </SidebarMenuButton>
          <SidebarMenuAction aria-label="Add filter" disabled={isAddFilterDisabled} onClick={onOpenSelection}>
            <Plus />
          </SidebarMenuAction>
        </SidebarMenuItem>
      </SidebarMenu>
    </EditorSidebarSection>
  )
}
