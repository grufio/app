"use client"

/**
 * Artboard actions bar — floating, top-right. Shown while the Artboard
 * section is active: three 40px circle buttons (Artboard / Grid / Image),
 * horizontally arranged.
 *
 * When no master image exists yet, Artboard and Grid are disabled and the
 * Image circle becomes an "add image" affordance (image-with-plus icon) — the
 * only available action is to bring an image in first.
 *
 * NOTE: tap actions are intentionally NOT wired yet — the editor toolbars are
 * being re-integrated step by step; this step only covers icons + states.
 */
import { Frame, Grid3x3, Image as ImageIcon, ImagePlus, type LucideIcon } from "lucide-react"

import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { circleClass } from "./floating-bar-styles"

type Props = {
  /** Whether a master image already exists on the project. */
  hasImage: boolean
}

export function EditorArtboardBar({ hasImage }: Props) {
  const tone = useEditorToolbarTone()

  const actions: { key: string; label: string; Icon: LucideIcon; disabled: boolean }[] = [
    { key: "artboard", label: "Artboard", Icon: Frame, disabled: !hasImage },
    { key: "grid", label: "Grid", Icon: Grid3x3, disabled: !hasImage },
    // No image yet → the Image circle is the "add image" entry point.
    { key: "image", label: "Image", Icon: hasImage ? ImageIcon : ImagePlus, disabled: false },
  ]

  return (
    <div className="absolute top-3 right-3 z-20 flex flex-row gap-2">
      {actions.map(({ key, label, Icon, disabled }) => (
        <button
          key={key}
          type="button"
          aria-label={label}
          disabled={disabled}
          className={circleClass(tone, disabled ? "inactive" : "active")}
        >
          <Icon aria-hidden="true" className="size-5" />
        </button>
      ))}
    </div>
  )
}
