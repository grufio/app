"use client"

/**
 * Image actions bar — floating, top-right. The Image section's submenu.
 *   - no master image → a single ImagePlus ("Add image") → opens the picker
 *   - master image present → three icons: Delete · Edit · Reset. Delete/Edit act
 *     on the image itself; Reset removes only the downstream filter/trace. The set
 *     toggles INVERSELY with `locked` (a filter/trace depends on the image):
 *       - locked   → Delete + Edit disabled, Reset enabled
 *       - unlocked → Delete + Edit enabled, Reset disabled (stays visible, greyed)
 *     So you Reset first (removes the downstream ⇒ unlocked), then Edit/Delete work.
 * Shown while the Image section is active. Tone from `EditorToolbarTone`.
 * Mirrors the Filter floating bar.
 */
import { ImagePlus, Pencil, RotateCcw, Trash2 } from "lucide-react"

import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { circleClass } from "./floating-bar-styles"

type Props = {
  /** Whether a master image exists — picks add vs the delete/edit/reset trio. */
  hasImage: boolean
  /** Opens the image dialog: the picker (no image) or the editor (has image). */
  onOpen: () => void
  /** Opens the delete-image confirmation. Disabled while `locked`. */
  onDelete: () => void
  /** A filter/trace depends on the image → Delete + Edit disabled, Reset enabled. */
  locked?: boolean
  /** Removes the downstream filter/trace (via a confirm dialog). Enabled only while `locked`. */
  onReset?: () => void
}

const DISABLED_CLS = "disabled:pointer-events-none disabled:opacity-40"

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
      <button
        type="button"
        aria-label="Delete image"
        onClick={onDelete}
        disabled={locked}
        className={`${circleClass(tone, "active")} ${DISABLED_CLS}`}
      >
        <Trash2 aria-hidden="true" className="size-5" />
      </button>
      <button
        type="button"
        aria-label="Edit image"
        onClick={onOpen}
        disabled={locked}
        className={`${circleClass(tone, "active")} ${DISABLED_CLS}`}
      >
        <Pencil aria-hidden="true" className="size-5" />
      </button>
      <button
        type="button"
        aria-label="Reset image"
        onClick={onReset}
        disabled={!locked}
        className={`${circleClass(tone, "active")} ${DISABLED_CLS}`}
      >
        <RotateCcw aria-hidden="true" className="size-5" />
      </button>
    </div>
  )
}
