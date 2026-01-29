"use client"

/**
 * Layers tree model.
 *
 * Responsibilities:
 * - Build a normalized layer hierarchy used by the editor layers menu.
 */
export type LayerKind = "artboard" | "image" | "filter"

export type LayerNode = {
  id: string
  kind: LayerKind
  label: string
  children?: LayerNode[]
  parentId?: string
}

export type ImageLayerInput = {
  /** Stable identifier for an image within the project (db id / role / filename). */
  imageId: string
  label: string
  filters?: { filterId: string; label: string }[]
}

export function buildLayersTree(opts: { images: ImageLayerInput[] }): LayerNode {
  const images = opts.images ?? []

  const rootId = "artboard"
  const imageNodes: LayerNode[] = images.map((img) => {
    const imageNodeId = `image:${img.imageId}`
    const filterNodes: LayerNode[] =
      (img.filters ?? []).map((f) => ({
        id: `filter:${img.imageId}:${f.filterId}`,
        kind: "filter",
        label: f.label,
        parentId: imageNodeId,
      })) ?? []

    return {
      id: imageNodeId,
      kind: "image",
      label: img.label,
      parentId: rootId,
      children: filterNodes.length ? filterNodes : undefined,
    }
  })

  return {
    id: rootId,
    kind: "artboard",
    label: "Artboard",
    children: imageNodes.length ? imageNodes : undefined,
  }
}

