import { FILTER_REGISTRY } from "@/lib/editor/filters/registry"

import type { FilterPanelStackItem } from "./types"

export function parseFilterType(value: unknown): FilterPanelStackItem["filterType"] {
  const type = String(value ?? "").trim().toLowerCase()
  return type in FILTER_REGISTRY ? (type as FilterPanelStackItem["filterType"]) : "unknown"
}
