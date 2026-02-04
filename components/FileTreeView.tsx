"use client"

import * as React from "react"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView"
import { TreeItem } from "@mui/x-tree-view/TreeItem"
import { ChevronDown, ChevronRight, Image as ImageIcon, LayoutGrid, Lock, Unlock } from "lucide-react"

export type FileNode = {
  id: string
  label: string
  type: "folder" | "file"
  locked?: boolean
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

function collectLockedById(nodes: FileNode[], acc: Record<string, boolean>) {
  for (const node of nodes) {
    if (node.locked === true) {
      acc[node.id] = true
    }
    if (node.children) {
      collectLockedById(node.children, acc)
    }
  }
}

function renderNode(
  node: FileNode,
  expandedIds: string[],
  onSelect: (node: FileNode) => void,
  lockedById: Record<string, boolean>,
  setLockedById: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
  hoverId: string | null,
  setHoverId: React.Dispatch<React.SetStateAction<string | null>>
): React.ReactNode {
  const isFolder = node.type === "folder"
  const isExpanded = expandedIds.includes(node.id)
  const isLocked = Boolean(lockedById[node.id])

  const handleSelect = (event: React.MouseEvent) => {
    event.stopPropagation()
    onSelect(node)
  }

  const handleLockClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    setLockedById((prev) => {
      if (isLocked) {
        const next = { ...prev }
        delete next[node.id]
        return next
      }
      return { ...prev, [node.id]: true }
    })
  }

  const icon = isFolder ? <LayoutGrid aria-hidden="true" size={16} strokeWidth={1} /> : <ImageIcon aria-hidden="true" size={16} strokeWidth={1} />

  const label = (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{ minWidth: 0 }}
      onClick={handleSelect}
      onMouseEnter={() => setHoverId(node.id)}
      onMouseLeave={() => setHoverId((prev) => (prev === node.id ? null : prev))}
    >
      <Box sx={iconBoxSx}>{icon}</Box>
      <Box
        flexGrow={1}
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
      {isLocked ? (
        <Box onClick={handleLockClick}>
          <Lock aria-hidden="true" size={16} strokeWidth={1} />
        </Box>
      ) : hoverId === node.id ? (
        <Box onClick={handleLockClick}>
          <Unlock aria-hidden="true" size={16} strokeWidth={1} />
        </Box>
      ) : null}
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
      {isFolder &&
        node.children?.map((child) =>
          renderNode(child, expandedIds, onSelect, lockedById, setLockedById, hoverId, setHoverId)
        )}
    </TreeItem>
  )
}

export function FileTreeView(props: FileTreeViewProps) {
  const { data, expandedIds, onExpandedIdsChange, onSelect, height = 280 } = props
  const [hoverId, setHoverId] = React.useState<string | null>(null)
  const [lockedById, setLockedById] = React.useState<Record<string, boolean>>(() => {
    const acc: Record<string, boolean> = {}
    collectLockedById(data, acc)
    return acc
  })

  React.useEffect(() => {
    setLockedById((prev) => {
      const acc: Record<string, boolean> = { ...prev }
      collectLockedById(data, acc)
      return acc
    })
  }, [data])

  const treeItems = React.useMemo(
    () => data.map((node) => renderNode(node, expandedIds, onSelect, lockedById, setLockedById, hoverId, setHoverId)),
    [data, expandedIds, onSelect, lockedById, hoverId]
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

