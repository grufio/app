"use client"

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
  const label = name === "app" ? "Artboard" : name === "api" ? "Image" : name

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
        className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
        open={isExpanded}
        onOpenChange={() => onToggleExpanded(id)}
      >
        <SidebarMenuButton
          asChild
          isActive={selectedId === id}
          className="text-xs data-[active=true]:font-normal"
        >
          <div>
            <button
              type="button"
              aria-label={isExpanded ? "Collapse" : "Expand"}
              className="inline-flex"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onToggleExpanded(id)
              }}
            >
              <ChevronRight
                className={
                  isExpanded
                    ? "size-4 rotate-90 transition-transform"
                    : "size-4 transition-transform"
                }
              />
            </button>
            {name === "app" ? (
              <LayoutGrid />
            ) : name === "api" ? (
              <ImageIcon />
            ) : (
              <Folder />
            )}
            <button
              type="button"
              className="flex-1 text-left"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onSelect(id)
              }}
            >
              {label}
            </button>
          </div>
        </SidebarMenuButton>
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

