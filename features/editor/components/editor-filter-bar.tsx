"use client"

/**
 * Filter actions bar — floating, top-right. The filter section's submenu.
 *   - no filter set → a single Plus ("Add filter") → opens the filter picker
 *   - filter set → Trash2 ("Delete filter", left) + Pencil ("Edit filter",
 *     right); delete removes the filter (may confirm if a trace depends on it),
 *     edit re-opens the picker to change the preset.
 * Shown while the Filter section is active. Tone from `EditorToolbarTone`.
 * Mirrors `EditorImageBar`.
 */
import { Pencil, Plus, Trash2 } from "lucide-react"

import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { circleClass } from "./floating-bar-styles"

type Props = {
  /** Whether a filter is set — picks add vs delete+edit. */
  hasFilter: boolean
  /** Opens the filter picker (to add, or to change the preset). */
  onOpen: () => void
  /** Removes the current filter. Only used when `hasFilter`. */
  onDelete: () => void
  /** Disable the "Add filter" action — a filter needs a source image, so
   * without one (or while a filter/trace action is in flight) adding is not
   * allowed. Only gates the ADD case; Edit/Delete (a filter exists) stay on. */
  addDisabled?: boolean
}

export function EditorFilterBar({ hasFilter, onOpen, onDelete, addDisabled = false }: Props) {
  const tone = useEditorToolbarTone()
  const openDisabled = !hasFilter && addDisabled

  return (
    <div className="absolute top-3 right-3 z-20 flex flex-row gap-2">
      {hasFilter ? (
        <button type="button" aria-label="Delete filter" onClick={onDelete} className={circleClass(tone, "active")}>
          <Trash2 aria-hidden="true" className="size-5" />
        </button>
      ) : null}
      <button
        type="button"
        aria-label={hasFilter ? "Edit filter" : "Add filter"}
        onClick={onOpen}
        disabled={openDisabled}
        className={`${circleClass(tone, "active")} disabled:pointer-events-none disabled:opacity-40`}
      >
        {hasFilter ? <Pencil aria-hidden="true" className="size-5" /> : <Plus aria-hidden="true" className="size-5" />}
      </button>
    </div>
  )
}
