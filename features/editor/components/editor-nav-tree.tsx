"use client"

import * as React from "react"

import { FileTreeView, type FileNode } from "@/components/FileTreeView"
import { buildNavId } from "@/features/editor/navigation/nav-id"

type EditorNavImage = { id: string; label: string }

export function buildEditorNavTreeData(images: EditorNavImage[]): FileNode[] {
  const imageChildren: FileNode[] =
    images.length > 0
      ? [
          {
            id: buildNavId({ kind: "imagesFolder" }),
            label: "Images",
            type: "folder",
            children: images.map((img) => ({
              id: buildNavId({ kind: "image", imageId: img.id }),
              label: img.label,
              type: "file",
            })),
          },
        ]
      : []

  return [
    {
      id: buildNavId({ kind: "artboard" }),
      label: "Artboard",
      type: "folder",
      children: imageChildren,
    },
  ]
}

export function resolveEditorNavSelectedItemId(selectedId: string, data: FileNode[]): string | null {
  const stack = [...data]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node) continue
    if (node.id === selectedId) return node.id
    if (node.children) stack.push(...node.children)
  }
  return null
}

export function EditorNavTree(props: {
  selectedId: string
  onSelect: (id: string) => void
  images: EditorNavImage[]
}) {
  const { selectedId, onSelect, images } = props

  const [expandedIds, setExpandedIds] = React.useState<string[]>(() => [buildNavId({ kind: "artboard" })])
  const data = React.useMemo(() => buildEditorNavTreeData(images), [images])
  const selectedItemId = React.useMemo(() => resolveEditorNavSelectedItemId(selectedId, data), [selectedId, data])

  return (
    <FileTreeView
      data={data}
      expandedIds={expandedIds}
      onExpandedIdsChange={setExpandedIds}
      selectedItemId={selectedItemId}
      onSelect={(node) => onSelect(node.id)}
      height="100%"
    />
  )
}
