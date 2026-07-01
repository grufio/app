"use client"

/**
 * Image actions bar — floating, top-right. The image context's submenu: a
 * single 40px circle button that opens the image dialog (`ImageSheet`).
 *   - no master image → ImagePlus ("Add image") → opens the image picker
 *   - master image present → Image ("Edit image") → opens the image editor
 * Shown while the Image action is the active context. Tone from
 * `EditorToolbarTone`. Mirrors `EditorArtboardBar`.
 */
import { Image as ImageIcon, ImagePlus } from "lucide-react"

import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { circleClass } from "./floating-bar-styles"

type Props = {
  /** Whether a master image exists — picks the icon + label (add vs edit). */
  hasImage: boolean
  /** Opens the image dialog. */
  onOpen: () => void
}

export function EditorImageBar({ hasImage, onOpen }: Props) {
  const tone = useEditorToolbarTone()
  const Icon = hasImage ? ImageIcon : ImagePlus
  const label = hasImage ? "Edit image" : "Add image"

  return (
    <div className="absolute top-3 right-3 z-20 flex flex-row gap-2">
      <button type="button" aria-label={label} onClick={onOpen} className={circleClass(tone, "active")}>
        <Icon aria-hidden="true" className="size-5" />
      </button>
    </div>
  )
}
