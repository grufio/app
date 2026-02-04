"use client"

import * as React from "react"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView"
import { TreeItem } from "@mui/x-tree-view/TreeItem"
import { ChevronDown, ChevronRight, Image as ImageIcon, LayoutGrid } from "lucide-react"

export type FileNode = {
  id: string
  label: string
  type: "folder" | "file"
  children?: FileNode[]
}

export type FileTreeViewProps = {
  data: FileNode[]
  expandedIds: string[]
  onExpandedIdsChange: (ids: string[]) => void
  onSelect: (node: FileNode) => void
  height?: number | string
}

const iconBoxSx = {
  width: 16,
  height: 16,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
}

function renderNode(node: FileNode, expandedIds: string[], onSelect: (node: FileNode) => void): React.ReactNode {
  const isFolder = node.type === "folder"
  const isExpanded = expandedIds.includes(node.id)

  const handleSelect = (event: React.MouseEvent) => {
    event.stopPropagation()
    onSelect(node)
  }

  const icon = isFolder ? <LayoutGrid aria-hidden="true" size={16} strokeWidth={1} /> : <ImageIcon aria-hidden="true" size={16} strokeWidth={1} />

  const label = (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }} onClick={handleSelect}>
      <Box sx={iconBoxSx}>{icon}</Box>
      <Box
        sx={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          cursor: isFolder ? "default" : "pointer",
        }}
      >
        {node.label}
      </Box>
    </Stack>
  )

  return (
    <TreeItem
      key={node.id}
      itemId={node.id}
      label={label}
      sx={{
        "& .MuiTreeItem-content": {
          height: 28,
          paddingY: 0,
          borderRadius: 1,
          "&:hover": {
            backgroundColor: "rgba(0,0,0,0.04)",
          },
        },
      }}
    >
      {isFolder && node.children?.map((child) => renderNode(child, expandedIds, onSelect))}
    </TreeItem>
  )
}

export function FileTreeView(props: FileTreeViewProps) {
  const { data, expandedIds, onExpandedIdsChange, onSelect, height = 280 } = props

  const treeItems = React.useMemo(
    () => data.map((node) => renderNode(node, expandedIds, onSelect)),
    [data, expandedIds, onSelect]
  )

  return (
    <Box sx={{ height, overflowY: "auto" }}>
      <SimpleTreeView
        expandedItems={expandedIds}
        onExpandedItemsChange={(_event, ids) => onExpandedIdsChange(ids as string[])}
        expansionTrigger="iconContainer"
        slots={{
          expandIcon: () => <ChevronRight aria-hidden="true" size={16} strokeWidth={1} />,
          collapseIcon: () => <ChevronDown aria-hidden="true" size={16} strokeWidth={1} />,
        }}
      >
        {treeItems}
      </SimpleTreeView>
    </Box>
  )
}

