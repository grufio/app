import { Grid3x3, Image, Palette, SlidersHorizontal, type LucideIcon } from "lucide-react"

import type { EditorSection } from "@/lib/editor/editor-sections"

export type SectionItem = {
  key: EditorSection
  label: string
  Icon: LucideIcon
}

/**
 * The editor sections as icon/label rows — the single source shared by the
 * section-switch nav and the top bar (active-section context), in pipeline
 * order Image → Filter → Trace → Color. `image` is the master-image placement
 * surface; it now also carries the artboard/page settings (the former standalone
 * "artboard" section was folded in). Icons here are provisional — the final icon
 * set lands in the nav design step.
 */
export const SECTION_ITEMS: SectionItem[] = [
  { key: "image", label: "Image", Icon: Image },
  { key: "filter", label: "Filter", Icon: SlidersHorizontal },
  { key: "trace", label: "Trace", Icon: Grid3x3 },
  { key: "colors", label: "Color", Icon: Palette },
]
