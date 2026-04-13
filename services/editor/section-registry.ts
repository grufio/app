import type { NavSelection } from "@/lib/editor/navigation/nav-id"

export type EditorRightPanelSection = "artboard" | "image" | "grid"
export type EditorNavKind = NavSelection["kind"]

type SectionRegistryEntry = {
  rightSection: EditorRightPanelSection
}

export const SECTION_REGISTRY: Record<EditorNavKind, SectionRegistryEntry> = {
  artboard: { rightSection: "artboard" },
  imagesFolder: { rightSection: "image" },
  image: { rightSection: "image" },
  grid: { rightSection: "grid" },
}

export function resolveRightSectionFromNavKind(kind: EditorNavKind): EditorRightPanelSection {
  return SECTION_REGISTRY[kind].rightSection
}
