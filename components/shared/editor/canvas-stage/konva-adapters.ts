import type Konva from "konva"

export type ClientRect = { x: number; y: number; width: number; height: number }

export function getClientRectRelative(node: Konva.Node, layer: Konva.Layer): ClientRect {
  return node.getClientRect({ relativeTo: layer })
}

export function getNodeXY(node: Konva.Node): { x: number; y: number } {
  return { x: node.x(), y: node.y() }
}

export function setNodeXY(node: Konva.Node, x: number, y: number): void {
  node.x(x)
  node.y(y)
}

