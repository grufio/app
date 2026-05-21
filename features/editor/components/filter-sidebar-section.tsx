"use client"

import { Eye, EyeOff, Plus, SlidersHorizontal, Trash2 } from "lucide-react"

import { SidebarMenu, SidebarMenuAction, SidebarMenuActions, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { FILTER_REGISTRY } from "@/lib/editor/filters/registry"
import { EditorSidebarSection } from "@/features/editor/components/sidebar/editor-sidebar-section"

import { isFilterRowActive } from "./filter-sidebar-section/is-filter-row-active"

function getFilterLabel(filterType: string): string {
  return (FILTER_REGISTRY as Record<string, { label: string } | undefined>)[filterType]?.label ?? "Filter"
}

export function FilterSidebarSection(props: {
  filterStack: Array<{ id: string; filterType: string }>
  canvasMode: "image" | "filter"
  hiddenFilterIds: Record<string, boolean>
  isAddFilterDisabled: boolean
  activeDisplayFilterId: string | null
  isActiveDisplayFilterHidden: boolean
  isRemovingFilter: boolean
  /** True while the filter chain is being fetched for the first time. */
  isLoadingInitial?: boolean
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
    isLoadingInitial,
    onSelectFilter,
    onToggleHidden,
    onRemoveFilter,
    onOpenSelection,
  } = props

  // First-load skeleton: show two placeholder rows so the sidebar doesn't feel
  // empty while the chain is being fetched. Subsequent refreshes render the
  // existing list (no flash to skeleton on every refetch).
  if (isLoadingInitial && filterStack.length === 0) {
    return (
      <EditorSidebarSection title="Filter">
        <SidebarMenu>
          {[0, 1].map((i) => (
            <SidebarMenuItem key={`filter-skeleton-${i}`}>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <Skeleton className="size-4" />
                <Skeleton className="h-3 w-20" />
              </div>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </EditorSidebarSection>
    )
  }

  return (
    <EditorSidebarSection title="Filter">
      <SidebarMenu>
        {filterStack.map((filter) => (
          <SidebarMenuItem key={filter.id}>
            <SidebarMenuButton
              isActive={isFilterRowActive({
                canvasMode,
                activeDisplayFilterId,
                isActiveDisplayFilterHidden,
                filterId: filter.id,
              })}
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
                {hiddenFilterIds[filter.id] ? <EyeOff /> : <Eye />}
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
