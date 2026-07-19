"use client"

/**
 * Filter actions bar — floating, top-right. The filter section's submenu.
 *   - no filter set → a single Plus ("Add filter") → opens the filter picker
 *   - filter set → three icons: Delete · Edit · Reset. Delete/Edit act on the
 *     filter itself; Reset removes only the downstream trace. The set toggles
 *     INVERSELY with `locked` (a trace depends on the filter):
 *       - locked   → Delete + Edit disabled, Reset enabled
 *       - unlocked → Delete + Edit enabled, Reset disabled (stays visible, greyed)
 *     So you Reset first (removes the trace ⇒ unlocked), then Edit/Delete work.
 * Shown while the Filter section is active. Tone from `EditorToolbarTone`.
 * Mirrors `EditorImageBar`.
 */
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react"

import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { circleClass } from "./floating-bar-styles"

type Props = {
  /** Whether a filter is set — picks add vs the delete/edit/reset trio. */
  hasFilter: boolean
  /** Opens the filter picker (to add, or to change the preset). */
  onOpen: () => void
  /** Removes the current filter. Disabled while `locked`. */
  onDelete: () => void
  /** Disable the "Add filter" action — a filter needs a source image, so
   * without one (or while a filter/trace action is in flight) adding is not
   * allowed. Only gates the ADD case. */
  addDisabled?: boolean
  /** A trace depends on the filter → Delete + Edit disabled, Reset enabled. */
  locked?: boolean
  /** Removes the downstream trace (via a confirm dialog). Enabled only while `locked`. */
  onReset?: () => void
}

const DISABLED_CLS = "disabled:pointer-events-none disabled:opacity-40"

export function EditorFilterBar({
  hasFilter,
  onOpen,
  onDelete,
  addDisabled = false,
  locked = false,
  onReset,
}: Props) {
  const tone = useEditorToolbarTone()

  if (!hasFilter) {
    return (
      <div className="absolute top-3 right-3 z-20 flex flex-row gap-2">
        <button
          type="button"
          aria-label="Add filter"
          onClick={onOpen}
          disabled={addDisabled}
          className={`${circleClass(tone, "active")} ${DISABLED_CLS}`}
        >
          <Plus aria-hidden="true" className="size-5" />
        </button>
      </div>
    )
  }

  return (
    <div className="absolute top-3 right-3 z-20 flex flex-row gap-2">
      <button
        type="button"
        aria-label="Delete filter"
        onClick={onDelete}
        disabled={locked}
        className={`${circleClass(tone, "active")} ${DISABLED_CLS}`}
      >
        <Trash2 aria-hidden="true" className="size-5" />
      </button>
      <button
        type="button"
        aria-label="Edit filter"
        onClick={onOpen}
        disabled={locked}
        className={`${circleClass(tone, "active")} ${DISABLED_CLS}`}
      >
        <Pencil aria-hidden="true" className="size-5" />
      </button>
      <button
        type="button"
        aria-label="Reset filter"
        onClick={onReset}
        disabled={!locked}
        className={`${circleClass(tone, "active")} ${DISABLED_CLS}`}
      >
        <RotateCcw aria-hidden="true" className="size-5" />
      </button>
    </div>
  )
}
