"use client"

/**
 * Trace actions bar — floating, top-right. The trace section's submenu.
 *   - no trace set → a single Plus ("Add trace") → opens the trace kind picker.
 *   - trace set → Trash2 ("Delete trace", left) + a right column: Pencil
 *     ("Edit trace") on top, and — when the trace references a palette — a
 *     colour-count button UNDER it (no icon, just the bold number of colours;
 *     opens the Colors dialog).
 * Shown while the Trace section is active. Tone from `EditorToolbarTone`.
 * Mirrors `EditorFilterBar` / `EditorImageBar`.
 */
import { Pencil, Plus, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"

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
  /** Number of palette colours the current trace references. `null` (legacy /
   * linerate — no palette) or `0` hides the colour button. */
  colorCount?: number | null
  /** Opens the Colors dialog. */
  onOpenColors?: () => void
}

export function EditorTraceBar({ hasTrace, onOpen, onDelete, colorCount, onOpenColors }: Props) {
  const tone = useEditorToolbarTone()
  const showColors = hasTrace && onOpenColors != null && colorCount != null && colorCount > 0

  return (
    <div className="absolute top-3 right-3 z-20 flex flex-row items-start gap-2">
      {hasTrace ? (
        <button type="button" aria-label="Delete trace" onClick={onDelete} className={circleClass(tone, "active")}>
          <Trash2 aria-hidden="true" className="size-5" />
        </button>
      ) : null}
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          aria-label={hasTrace ? "Edit trace" : "Add trace"}
          onClick={onOpen}
          className={circleClass(tone, "active")}
        >
          {hasTrace ? <Pencil aria-hidden="true" className="size-5" /> : <Plus aria-hidden="true" className="size-5" />}
        </button>
        {showColors ? (
          <button
            type="button"
            aria-label={`Colors (${colorCount})`}
            onClick={onOpenColors}
            className={circleClass(tone, "active")}
          >
            {/* No icon — the bold colour count is the label. Shrink 3-digit
                counts so they stay inside the 40px circle. */}
            <span className={cn("font-bold tabular-nums", colorCount >= 100 ? "text-xs" : "text-sm")}>
              {colorCount}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
