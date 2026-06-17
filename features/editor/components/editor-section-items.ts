import { Frame, Grid3x3, Palette, SlidersHorizontal, type LucideIcon } from "lucide-react"

import type { EditorSection } from "@/lib/editor/editor-sections"

export type SectionItem = {
  key: EditorSection
  label: string
  Icon: LucideIcon
}

/**
 * The four editor sections as icon/label rows — the single source shared by
 * the bottom navigation (section switching) and the top bar (active-section
 * context). "Image" label vs the `artboard` section key is intentional: the
 * `EditorSection` tuple stays `["artboard", …]`, only the user-facing label
 * reads "Image" (renaming the key would ripple through `editor-sections.ts`
 * and the display-layer plumbing).
 */
export const SECTION_ITEMS: SectionItem[] = [
  { key: "artboard", label: "Image", Icon: Frame },
  { key: "filter", label: "Filter", Icon: SlidersHorizontal },
  { key: "trace", label: "Trace", Icon: Grid3x3 },
  { key: "colors", label: "Color", Icon: Palette },
]
