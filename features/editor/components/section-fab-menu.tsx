"use client"

/**
 * The floating "+" kind-menu that drops beneath a section icon in
 * `EditorTopLeftBar` (Trace, Filter, …). Presentational + section-agnostic:
 * the caller passes an `items` array describing each kind frame and how it
 * behaves, plus two close-on-action flags. The component owns only the
 * `+`/× toggle chrome, the outside-pointerdown dismissal, and the per-item
 * delete spinner.
 *
 * Layout (one 40×40-wide, horizontally-centred column under the `+`):
 *   (+/×)            ← circle, toggles the menu
 *   [kind]           ← selectable / disabled frame  (non-active item)
 *   (lead) [kind] (🗑) ← active item: optional LEFT lead circle (Edit / Unlock)
 *                       + indicator frame + optional RIGHT delete circle
 *
 * The lead + delete circles are absolutely positioned off the active frame's
 * sides so adding them never shifts the frame off-centre from the `+`.
 */
import { useEffect, useState, type RefObject } from "react"
import { Loader2, Plus, Trash2, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { circleClass, frameClass } from "./floating-bar-styles"

/**
 * Minimum time the delete spinner stays visible, so the animation reads even
 * when `onDelete` is synchronous (e.g. a local state-machine event that
 * resolves on the next microtask). Without a floor, React batches the
 * deletingKey on→off in a single paint and the spinner never shows — async
 * handlers slower than this floor are unaffected. This is what makes the
 * delete animation consistent across every section that uses this menu.
 */
const DELETE_SPINNER_MIN_MS = 350

/** The optional LEFT-flank circle on an active row (Trace→Edit, Filter→Unlock). */
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
  /** LEFT-flank circle, only consulted when `active`. */
  lead?: FlankAction
  /** RIGHT delete circle, only consulted when `active`; spins until it resolves. */
  onDelete?: () => void | Promise<void>
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Wraps the section icon + this menu; used for outside-click dismissal so a
   * tap on the section icon doesn't count as "outside". */
  containerRef: RefObject<HTMLElement | null>
  items: FabMenuItem[]
  labels: { add: string; close: string }
  /** aria-label for the delete circle ("Delete trace" / "Delete filter"). */
  deleteLabel: string
  /** Close the whole menu after a selectable tap / a lead tap (trace: true). */
  closeOnSelect?: boolean
  /** Close the whole menu after a delete resolves (trace: true). */
  closeOnDelete?: boolean
}

export function SectionFabMenu({
  open,
  onOpenChange,
  containerRef,
  items,
  labels,
  deleteLabel,
  closeOnSelect = false,
  closeOnDelete = false,
}: Props) {
  const tone = useEditorToolbarTone()
  // Which item's delete is in flight (null = idle). Held here so the row keeps
  // its active indicator + spinner even if the parent flips it inactive the
  // instant the async delete resolves, a beat before the menu closes.
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const deleting = deletingKey !== null

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && containerRef.current?.contains(target)) return
      onOpenChange(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open, containerRef, onOpenChange])

  const runDelete = async (item: FabMenuItem) => {
    if (deleting || !item.onDelete) return
    setDeletingKey(item.key)
    // Run the spinner floor concurrently with the delete: we wait for the
    // longer of the two, so a slow async handler adds no extra delay while a
    // synchronous one still shows the animation for the floor.
    const spinnerFloor = new Promise((resolve) => setTimeout(resolve, DELETE_SPINNER_MIN_MS))
    try {
      await item.onDelete()
    } finally {
      await spinnerFloor
      setDeletingKey(null)
      if (closeOnDelete) onOpenChange(false)
    }
  }

  return (
    <div className="absolute top-full left-1/2 mt-3 flex -translate-x-1/2 flex-col items-center gap-2">
      <button
        type="button"
        aria-label={open ? labels.close : labels.add}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className={circleClass(tone)}
      >
        <Plus
          aria-hidden="true"
          className={cn("size-5 transition-transform duration-200", open && "rotate-45")}
        />
      </button>
      {open &&
        items.map((item) => {
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
                onClick={
                  item.disabled
                    ? undefined
                    : () => {
                        if (closeOnSelect) onOpenChange(false)
                        item.onSelect?.()
                      }
                }
                className={frameClass(tone, item.disabled ? "inactive" : "active")}
              >
                <Icon aria-hidden="true" className="size-6" />
              </button>
            )
          }

          // Active → indicator frame, optional lead (left) + delete (right).
          const lead = item.lead
          const LeadIcon = lead?.icon
          return (
            <div key={key} className="relative">
              {lead && LeadIcon ? (
                <button
                  type="button"
                  aria-label={lead.label}
                  disabled={lead.disabled || isDeleting}
                  onClick={
                    lead.disabled
                      ? undefined
                      : () => {
                          if (closeOnSelect) onOpenChange(false)
                          lead.onClick?.()
                        }
                  }
                  className={cn(circleClass(tone), "absolute top-1/2 right-full mr-2 -translate-y-1/2")}
                >
                  <LeadIcon aria-hidden="true" className="size-5" />
                </button>
              ) : null}
              <div className={frameClass(tone)} aria-label={label}>
                <Icon aria-hidden="true" className="size-6" />
              </div>
              {item.onDelete ? (
                <button
                  type="button"
                  aria-label={deleteLabel}
                  disabled={isDeleting}
                  onClick={() => void runDelete(item)}
                  className={cn(circleClass(tone), "absolute top-1/2 left-full ml-2 -translate-y-1/2")}
                >
                  {isDeleting ? (
                    <Loader2 aria-hidden="true" className="size-5 animate-spin" />
                  ) : (
                    <Trash2 aria-hidden="true" className="size-5" />
                  )}
                </button>
              ) : null}
            </div>
          )
        })}
    </div>
  )
}
