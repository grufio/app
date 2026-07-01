"use client"

/**
 * menu bar — the bottom-centre section switcher (horizontal pill). Switches
 * the active `EditorSection`. An Image action button sits directly to the
 * right of the Artboard section icon and opens the image dialog
 * (size / position / align). Tone from the `EditorToolbarTone` context.
 */
import { Fragment } from "react"
import { Image as ImageIcon, ImagePlus } from "lucide-react"

import type { EditorSection } from "@/lib/editor/editor-sections"
import { cn } from "@/lib/utils"

import { SECTION_ITEMS } from "./editor-section-items"
import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { pillClass } from "./floating-bar-styles"
import { ToolbarIconButton } from "./toolbar-icon-button"

type Props = {
  activeSection: EditorSection
  onSelectSection: (section: EditorSection) => void
  /** Activates the Image context (top-right add/edit icon). Rendered right of
   * the Artboard icon. */
  onOpenImage?: () => void
  /** Whether a master image exists — toggles the Image button's icon. */
  hasImage?: boolean
  /** Whether the Image context is the active one (highlights the Image button
   * and, since it lives inside the artboard section, suppresses the Artboard
   * section highlight). */
  imageActive?: boolean
}

export function EditorMenuBar({ activeSection, onSelectSection, onOpenImage, hasImage = false, imageActive = false }: Props) {
  const tone = useEditorToolbarTone()
  return (
    <div className={cn(pillClass(tone, "group"), "absolute bottom-4 left-1/2 z-20 -translate-x-1/2")}>
      {SECTION_ITEMS.map(({ key, label, Icon }) => (
        <Fragment key={key}>
          <ToolbarIconButton
            label={label}
            active={key === activeSection && !imageActive}
            onClick={() => onSelectSection(key)}
          >
            <Icon aria-hidden="true" className="size-6" />
          </ToolbarIconButton>
          {key === "artboard" && onOpenImage ? (
            <ToolbarIconButton label={hasImage ? "Edit image" : "Add image"} active={imageActive} onClick={onOpenImage}>
              {hasImage ? (
                <ImageIcon aria-hidden="true" className="size-6" />
              ) : (
                <ImagePlus aria-hidden="true" className="size-6" />
              )}
            </ToolbarIconButton>
          ) : null}
        </Fragment>
      ))}
    </div>
  )
}
