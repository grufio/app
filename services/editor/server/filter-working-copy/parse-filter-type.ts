import type { FilterPanelStackItem } from "./types"

export function parseFilterType(value: unknown): FilterPanelStackItem["filterType"] {
  const type = String(value ?? "").toLowerCase()
  if (type === "pixelate") return "pixelate"
  if (type === "lineart" || type === "line art") return "lineart"
  if (type === "numerate") return "numerate"
  return "unknown"
}
