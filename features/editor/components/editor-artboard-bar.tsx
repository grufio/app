"use client"

/**
 * Artboard actions bar — floating, top-right. Shown while the Artboard
 * section is active: two 40px circle buttons (Artboard / Grid), horizontally
 * arranged.
 *
 * When no master image exists yet, both are disabled. The Image action moved
 * to the canvas toolbar (bottom Image button); see `EditorToolsBar`.
 *
 * The Artboard and Grid taps are not wired yet — re-integrating step by step.
 */
import { Frame, Grid3x3, type LucideIcon } from "lucide-react"

import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { circleClass } from "./floating-bar-styles"

type Props = {
  /** Whether a master image already exists on the project. */
  hasImage: boolean
}

export function EditorArtboardBar({ hasImage }: Props) {
  const tone = useEditorToolbarTone()

  const actions: {
    key: string
    label: string
    Icon: LucideIcon
    disabled: boolean
    onClick?: () => void
  }[] = [
    { key: "artboard", label: "Artboard", Icon: Frame, disabled: !hasImage },
    { key: "grid", label: "Grid", Icon: Grid3x3, disabled: !hasImage },
  ]

  return (
    <div className="absolute top-3 right-3 z-20 flex flex-row gap-2">
      {actions.map(({ key, label, Icon, disabled, onClick }) => (
        <button
          key={key}
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={circleClass(tone, disabled ? "inactive" : "active")}
        >
          <Icon aria-hidden="true" className="size-5" />
        </button>
      ))}
    </div>
  )
}
