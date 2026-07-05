import { Frame, Grid3x3, Image, Palette, SlidersHorizontal, type LucideIcon } from "lucide-react"

import type { EditorSection } from "@/lib/editor/editor-sections"

export type SectionItem = {
  key: EditorSection
  label: string
  Icon: LucideIcon
}

/**
 * The editor sections as icon/label rows — the single source shared by the
 * section-switch nav and the top bar (active-section context), in pipeline
 * order Artboard → Image → Filter → Trace → Color. `artboard` is the
 * page/frame surface; `image` is the master-image placement surface (its own
 * section since it is an independent area in the UI). Icons here are
 * provisional — the final icon set lands in the nav design step.
 */
export const SECTION_ITEMS: SectionItem[] = [
  { key: "artboard", label: "Artboard", Icon: Frame },
  { key: "image", label: "Image", Icon: Image },
  { key: "filter", label: "Filter", Icon: SlidersHorizontal },
  { key: "trace", label: "Trace", Icon: Grid3x3 },
  { key: "colors", label: "Color", Icon: Palette },
]
