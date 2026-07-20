"use client"

/**
 * Image actions bar — floating, top-right. The Image section's submenu.
 *   - no master image → a single ImagePlus ("Add image") → opens the picker
 *   - master image present → EITHER the own-layer actions OR the reset, never
 *     both, gated by `locked` (a filter/trace depends on the image):
 *       - unlocked → Delete + Edit (act on the image itself)
 *       - locked   → Reset only (removes the downstream filter/trace)
 *     So while something downstream depends on the image you only see Reset; once
 *     it's gone the own-layer Delete/Edit come back.
 * Shown while the Image section is active. Tone from `EditorToolbarTone`.
 * Mirrors the Filter floating bar.
 */
import { ImagePlus, Pencil, RotateCcw, Trash2 } from "lucide-react"

import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { circleClass } from "./floating-bar-styles"

type Props = {
  /** Whether a master image exists — picks add vs the own-layer / reset set. */
  hasImage: boolean
  /** Opens the image dialog: the picker (no image) or the editor (has image). */
  onOpen: () => void
  /** Opens the delete-image confirmation. Shown only while unlocked. */
  onDelete: () => void
  /** A filter/trace depends on the image → show Reset instead of Delete/Edit. */
  locked?: boolean
  /** Removes the downstream filter/trace (via a confirm dialog). Shown only while `locked`. */
  onReset?: () => void
}

export function EditorImageBar({ hasImage, onOpen, onDelete, locked = false, onReset }: Props) {
  const tone = useEditorToolbarTone()

  if (!hasImage) {
    return (
      <div className="absolute top-3 right-3 z-20 flex flex-row gap-2">
        <button type="button" aria-label="Add image" onClick={onOpen} className={circleClass(tone, "active")}>
          <ImagePlus aria-hidden="true" className="size-5" />
        </button>
      </div>
    )
  }

  return (
    <div className="absolute top-3 right-3 z-20 flex flex-row gap-2">
      {locked ? (
        <button type="button" aria-label="Reset image" onClick={onReset} className={circleClass(tone, "active")}>
          <RotateCcw aria-hidden="true" className="size-5" />
        </button>
      ) : (
        <>
          <button type="button" aria-label="Delete image" onClick={onDelete} className={circleClass(tone, "active")}>
            <Trash2 aria-hidden="true" className="size-5" />
          </button>
          <button type="button" aria-label="Edit image" onClick={onOpen} className={circleClass(tone, "active")}>
            <Pencil aria-hidden="true" className="size-5" />
          </button>
        </>
      )}
    </div>
  )
}
