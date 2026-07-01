"use client"

/**
 * Artboard actions bar — floating, top-right. The artboard context's submenu:
 * two 40px circle buttons, each opening its own dialog —
 *   - Artboard (Frame icon) → the artboard/canvas-size dialog (`ArtboardSheet`)
 *   - Grid → the grid dialog (`GridSheet`)
 * Shown while the Artboard section is active. Tone from `EditorToolbarTone`.
 */
import { Frame, Grid3x3, type LucideIcon } from "lucide-react"

import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { circleClass } from "./floating-bar-styles"

type ArtboardBarDialog = "artboard" | "grid"

type Props = {
  /** Opens the matching artboard dialog: "artboard" (canvas size) or "grid". */
  onOpenDialog: (kind: ArtboardBarDialog) => void
}

export function EditorArtboardBar({ onOpenDialog }: Props) {
  const tone = useEditorToolbarTone()

  const actions: { key: ArtboardBarDialog; label: string; Icon: LucideIcon }[] = [
    { key: "artboard", label: "Artboard", Icon: Frame },
    { key: "grid", label: "Grid", Icon: Grid3x3 },
  ]

  return (
    <div className="absolute top-3 right-3 z-20 flex flex-row gap-2">
      {actions.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          aria-label={label}
          onClick={() => onOpenDialog(key)}
          className={circleClass(tone, "active")}
        >
          <Icon aria-hidden="true" className="size-5" />
        </button>
      ))}
    </div>
  )
}
