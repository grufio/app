"use client"

/**
 * Project editor sidebar (file/layer tree placeholder).
 *
 * Responsibilities:
 * - Render a collapsible tree and selection state for the editor left panel.
 * - Currently uses sample data.
 */
import * as React from "react"
import { ChevronRight, File, Folder, Image as ImageIcon, LayoutGrid } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar"
import { mapSidebarNodeIconKey, mapSidebarNodeLabel } from "@/services/editor/navigation-mapping"

// This is sample data.
const data = {
  tree: [
    [
      "app",
      [
        "api",
        ["hello", ["route.ts"]],
      ],
    ],
  ],
}

export function ProjectSidebar(props: {
  selectedId: string
  onSelect: (id: string) => void
}) {
  const { selectedId, onSelect } = props
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => new Set())

  const toggleExpanded = React.useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Files</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {data.tree.map((item, index) => (
              <Tree
                key={index}
                item={item}
                parentId=""
                selectedId={selectedId}
                onSelect={onSelect}
                expandedIds={expandedIds}
                onToggleExpanded={toggleExpanded}
              />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  )
}

type TreeItem = string | TreeItem[]

function Tree(props: {
  item: TreeItem
  parentId: string
  selectedId: string | null
  onSelect: (id: string) => void
  expandedIds: Set<string>
  onToggleExpanded: (id: string) => void
}) {
  const { item, parentId, selectedId, onSelect, expandedIds, onToggleExpanded } =
    props
  const [name, ...items] = Array.isArray(item) ? item : [item]
  const label = mapSidebarNodeLabel(name)

  const id = parentId ? `${parentId}/${name}` : String(name)
  const isExpanded = items.length ? expandedIds.has(id) : false

  if (!items.length) {
    return (
      <SidebarMenuButton
        isActive={selectedId === id}
        className="text-xs data-[active=true]:font-normal"
        onClick={() => onSelect(id)}
      >
        <File />
        {label}
      </SidebarMenuButton>
    )
  }

  return (
    <SidebarMenuItem>
      <Collapsible
        className="group/collapsible"
        open={isExpanded}
        onOpenChange={(open) => {
          // Controlled: expanded state lives in `expandedIds`.
          // Keep Radix open state and our state in sync.
          if (open !== isExpanded) onToggleExpanded(id)
        }}
      >
        <div className="flex items-center">
          {/* Caret: toggle only, no hover state, no pointer cursor. */}
          <button
            type="button"
            aria-label={isExpanded ? "Collapse" : "Expand"}
            className="inline-flex size-6 items-center justify-center cursor-pointer"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggleExpanded(id)
            }}
          >
            <ChevronRight
              className={
                isExpanded
                  ? "size-4 transition-transform rotate-90"
                  : "size-4 transition-transform"
              }
            />
          </button>

          {/* Folder row: selectable + hover (like dashboard menu items). */}
          <SidebarMenuButton
            isActive={selectedId === id}
            className="text-xs cursor-pointer data-[active=true]:font-normal flex-1"
            onClick={() => onSelect(id)}
          >
            {(() => {
              const key = mapSidebarNodeIconKey(name)
              if (key === "artboard") return <LayoutGrid />
              if (key === "image") return <ImageIcon />
              return <Folder />
            })()}
            {label}
          </SidebarMenuButton>
        </div>
        <CollapsibleContent>
          <SidebarMenuSub>
            {items.map((subItem, index) => (
              <Tree
                key={index}
                item={subItem}
                parentId={id}
                selectedId={selectedId}
                onSelect={onSelect}
                expandedIds={expandedIds}
                onToggleExpanded={onToggleExpanded}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  )
}

