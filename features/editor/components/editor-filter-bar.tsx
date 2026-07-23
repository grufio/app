"use client"

/**
 * Filter actions bar — floating, top-right. The filter section's submenu.
 *   - no filter set → a single Plus ("Add filter") → opens the filter picker
 *   - filter set → EITHER the own-layer actions OR the reset, never both, gated
 *     by `locked` (a trace depends on the filter):
 *       - unlocked → Delete + Edit (act on the filter itself)
 *       - locked   → Reset only (removes the downstream trace)
 *     So while a trace depends on the filter you only see Reset; once it's gone
 *     the own-layer Delete/Edit come back.
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
  /** Opens the delete-filter confirm. Shown only while unlocked. */
  onDelete: () => void
  /** Disable the "Add filter" action — a filter needs a source image, so
   * without one (or while a filter/trace action is in flight) adding is not
   * allowed. Only gates the ADD case. */
  addDisabled?: boolean
  /** Greys out the Delete button while the workflow can't mutate (not idle /
   * a mutation in flight), so the confirmed remove never no-ops from the UI.
   * The button stays in place (disabled), never removed — no layout shift. */
  deleteDisabled?: boolean
  /** A trace depends on the filter → show Reset instead of Delete/Edit. */
  locked?: boolean
  /** Removes the downstream trace (via a confirm dialog). Shown only while `locked`. */
  onReset?: () => void
}

const DISABLED_CLS = "disabled:pointer-events-none disabled:opacity-40"

export function EditorFilterBar({
  hasFilter,
  onOpen,
  onDelete,
  addDisabled = false,
  deleteDisabled = false,
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
      {locked ? (
        <button type="button" aria-label="Reset filter" onClick={onReset} className={circleClass(tone, "active")}>
          <RotateCcw aria-hidden="true" className="size-5" />
        </button>
      ) : (
        <>
          <button
            type="button"
            aria-label="Delete filter"
            onClick={onDelete}
            disabled={deleteDisabled}
            className={`${circleClass(tone, "active")} ${DISABLED_CLS}`}
          >
            <Trash2 aria-hidden="true" className="size-5" />
          </button>
          <button type="button" aria-label="Edit filter" onClick={onOpen} className={circleClass(tone, "active")}>
            <Pencil aria-hidden="true" className="size-5" />
          </button>
        </>
      )}
    </div>
  )
}
