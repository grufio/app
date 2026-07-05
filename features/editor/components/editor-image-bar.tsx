"use client"

/**
 * Image actions bar — floating, top-right. The Image section's submenu.
 *   - no master image → a single ImagePlus ("Add image") → opens the picker
 *   - master image present → Trash2 ("Delete image", left) + Pencil ("Edit
 *     image", right); delete opens the confirmation dialog, edit opens the
 *     image editor.
 * Shown while the Image section is active. Tone from
 * `EditorToolbarTone`. Mirrors `EditorArtboardBar`.
 */
import { ImagePlus, Pencil, Trash2 } from "lucide-react"

import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { circleClass } from "./floating-bar-styles"

type Props = {
  /** Whether a master image exists — picks add vs delete+edit. */
  hasImage: boolean
  /** Opens the image dialog: the picker (no image) or the editor (has image). */
  onOpen: () => void
  /** Opens the delete-image confirmation dialog. Only used when `hasImage`. */
  onDelete: () => void
}

export function EditorImageBar({ hasImage, onOpen, onDelete }: Props) {
  const tone = useEditorToolbarTone()

  return (
    <div className="absolute top-3 right-3 z-20 flex flex-row gap-2">
      {hasImage ? (
        <button type="button" aria-label="Delete image" onClick={onDelete} className={circleClass(tone, "active")}>
          <Trash2 aria-hidden="true" className="size-5" />
        </button>
      ) : null}
      <button
        type="button"
        aria-label={hasImage ? "Edit image" : "Add image"}
        onClick={onOpen}
        className={circleClass(tone, "active")}
      >
        {hasImage ? <Pencil aria-hidden="true" className="size-5" /> : <ImagePlus aria-hidden="true" className="size-5" />}
      </button>
    </div>
  )
}
