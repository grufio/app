"use client"

/**
 * Artboard actions bar — floating, top-right. Shown while the Artboard
 * section is active: three 40px circle buttons (Artboard / Grid / Image),
 * horizontally arranged.
 *
 * NOTE: tap actions are intentionally NOT wired yet — the editor toolbars are
 * being re-integrated step by step; this step only brings the icons in.
 */
import { Frame, Grid3x3, Image as ImageIcon, type LucideIcon } from "lucide-react"

import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { circleClass } from "./floating-bar-styles"

type ArtboardAction = { key: string; label: string; Icon: LucideIcon }

const ARTBOARD_ACTIONS: ArtboardAction[] = [
  { key: "artboard", label: "Artboard", Icon: Frame },
  { key: "grid", label: "Grid", Icon: Grid3x3 },
  { key: "image", label: "Image", Icon: ImageIcon },
]

export function EditorArtboardBar() {
  const tone = useEditorToolbarTone()
  return (
    <div className="absolute top-3 right-3 z-20 flex flex-row gap-2">
      {ARTBOARD_ACTIONS.map(({ key, label, Icon }) => (
        <button key={key} type="button" aria-label={label} className={circleClass(tone)}>
          <Icon aria-hidden="true" className="size-5" />
        </button>
      ))}
    </div>
  )
}
