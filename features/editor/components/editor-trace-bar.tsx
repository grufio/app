"use client"

/**
 * Trace actions bar — floating, top-right. The trace section's submenu.
 *   - no trace set → a single Plus ("Add trace") → opens the trace kind picker.
 *   - trace set → Trash2 ("Delete trace", left) + Pencil ("Edit trace", right);
 *     delete clears the trace, edit re-opens the configure dialog for it.
 * Shown while the Trace section is active. Tone from `EditorToolbarTone`.
 * Mirrors `EditorFilterBar` / `EditorImageBar`.
 */
import { Pencil, Plus, Trash2 } from "lucide-react"

import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { circleClass } from "./floating-bar-styles"

type Props = {
  /** Whether a trace is set — picks add vs delete+edit. */
  hasTrace: boolean
  /** Opens the picker (no trace) or the configure dialog for the current
   * trace (trace set). */
  onOpen: () => void
  /** Clears the current trace. Only used when `hasTrace`. */
  onDelete: () => void
}

export function EditorTraceBar({ hasTrace, onOpen, onDelete }: Props) {
  const tone = useEditorToolbarTone()

  return (
    <div className="absolute top-3 right-3 z-20 flex flex-row gap-2">
      {hasTrace ? (
        <button type="button" aria-label="Delete trace" onClick={onDelete} className={circleClass(tone, "active")}>
          <Trash2 aria-hidden="true" className="size-5" />
        </button>
      ) : null}
      <button
        type="button"
        aria-label={hasTrace ? "Edit trace" : "Add trace"}
        onClick={onOpen}
        className={circleClass(tone, "active")}
      >
        {hasTrace ? <Pencil aria-hidden="true" className="size-5" /> : <Plus aria-hidden="true" className="size-5" />}
      </button>
    </div>
  )
}
