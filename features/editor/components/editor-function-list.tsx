"use client"

/**
 * Always-visible vertical list of an editor section's function frames, used by
 * `EditorFuncsBar` (top-right, under the theme bar). Unlike the former
 * collapsible "+" menu there is **no trigger and no parent icon** — every kind
 * frame is shown directly. Right-aligned so the frames sit under the theme
 * toggle; the active row's Edit/Delete circles flank it on the **left**
 * (Delete left-most, next to Edit), so nothing extends past the right edge.
 *
 * Layout per row:
 *   [kind]                         ← non-active: selectable / disabled frame
 *   (🗑) (Edit) [kind]             ← active: Delete + Edit/Unlock circles left of
 *                                    the indicator frame
 */
import { useState } from "react"
import { Loader2, Trash2, type LucideIcon } from "lucide-react"

import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { circleClass, frameClass } from "./floating-bar-styles"

/**
 * Minimum time the delete spinner stays visible so the animation reads even
 * when `onDelete` is synchronous (e.g. a local state-machine event). Without a
 * floor, React batches the deletingKey on→off in one paint and the spinner
 * never shows; async handlers slower than this floor are unaffected.
 */
const DELETE_SPINNER_MIN_MS = 600

/** The optional flank circle on an active row (Edit / Unlock). */
type FlankAction = {
  icon: LucideIcon
  label: string
  onClick?: () => void
  disabled?: boolean
}

export type FabMenuItem = {
  key: string
  label: string
  Icon: LucideIcon
  /** Active → indicator frame + optional flanks; else a selectable/disabled frame. */
  active: boolean
  /** Disables the non-active (selectable) frame (e.g. trace lock-out / add disabled). */
  disabled?: boolean
  /** Tap on a selectable (non-active, non-disabled) frame. */
  onSelect?: () => void
  /** Edit/Unlock circle, only consulted when `active`. */
  lead?: FlankAction
  /** Delete circle, only consulted when `active`; spins until it resolves. */
  onDelete?: () => void | Promise<void>
}

type Props = {
  items: FabMenuItem[]
  /** aria-label for the Delete circle ("Delete trace" / "Delete filter"). */
  deleteLabel: string
}

export function EditorFunctionList({ items, deleteLabel }: Props) {
  const tone = useEditorToolbarTone()
  // Which item's delete is in flight (null = idle). Held here so the row keeps
  // its active indicator + spinner even if the parent flips it inactive the
  // instant the async delete resolves.
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const deleting = deletingKey !== null

  const runDelete = async (item: FabMenuItem) => {
    if (deleting || !item.onDelete) return
    setDeletingKey(item.key)
    // Run the spinner floor concurrently with the delete: wait for the longer
    // of the two, so a slow async handler adds no extra delay while a
    // synchronous one still shows the animation for the floor.
    const spinnerFloor = new Promise((resolve) => setTimeout(resolve, DELETE_SPINNER_MIN_MS))
    try {
      await item.onDelete()
    } finally {
      await spinnerFloor
      setDeletingKey(null)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {items.map((item) => {
        const { key, label, Icon } = item
        const isDeleting = deletingKey === key
        const showActive = item.active || isDeleting

        // Non-active → a selectable (or disabled) frame.
        if (!showActive) {
          return (
            <button
              key={key}
              type="button"
              aria-label={label}
              disabled={item.disabled}
              onClick={item.disabled ? undefined : () => item.onSelect?.()}
              className={frameClass(tone, item.disabled ? "inactive" : "active")}
            >
              <Icon aria-hidden="true" className="size-6" />
            </button>
          )
        }

        // Active → Delete (left-most) + Edit/Unlock + indicator frame.
        const lead = item.lead
        const LeadIcon = lead?.icon
        return (
          <div key={key} className="flex items-center gap-2">
            {/* Keep the Delete circle mounted while a delete is in flight even
                if `onDelete` just became undefined (a parallel section flips
                the row inactive the instant the remove resolves). */}
            {item.onDelete || isDeleting ? (
              <button
                type="button"
                aria-label={deleteLabel}
                disabled={isDeleting}
                onClick={() => void runDelete(item)}
                className={circleClass(tone)}
              >
                {isDeleting ? (
                  <Loader2 aria-hidden="true" className="size-5 animate-spin" />
                ) : (
                  <Trash2 aria-hidden="true" className="size-5" />
                )}
              </button>
            ) : null}
            {lead && LeadIcon ? (
              <button
                type="button"
                aria-label={lead.label}
                disabled={lead.disabled || isDeleting}
                onClick={lead.disabled ? undefined : () => lead.onClick?.()}
                className={circleClass(tone)}
              >
                <LeadIcon aria-hidden="true" className="size-5" />
              </button>
            ) : null}
            <div className={frameClass(tone)} aria-label={label}>
              <Icon aria-hidden="true" className="size-6" />
            </div>
          </div>
        )
      })}
    </div>
  )
}
