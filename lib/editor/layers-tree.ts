/**
 * Layers tree types — shared by the editor layers menu and the
 * flattening helper. The tree itself is constructed inline by
 * callers; this module only defines the shape.
 */
export type LayerKind = "artboard" | "image" | "filter"

export type LayerNode = {
  id: string
  kind: LayerKind
  label: string
  children?: LayerNode[]
  parentId?: string
}
