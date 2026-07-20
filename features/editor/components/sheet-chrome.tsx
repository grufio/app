"use client"

/**
 * Shared chrome for the editor section dialogs (Artboard / Grid / Image /
 * Trace). These four full-screen-on-mobile / bounded-card-on-desktop sheets
 * (see `sheetRootClass`) all open with the same title-bar and, for the
 * empty-state surfaces, the same "add" nav-row — extracted here so the markup
 * lives in one place.
 *
 * (The Colors surface is intentionally NOT a consumer: it's a section view,
 * not a dialog — no close affordance, its own root container.)
 */
import type { ReactNode } from "react"
import { type LucideIcon } from "lucide-react"

import { DialogFooterActions, DialogHeaderActions, type DialogAction } from "./dialog-action-controls"

export type { DialogAction }

/**
 * Sheet title-bar: the section title + the responsive action group. Non-close
 * `actions` render as icon buttons here on mobile and move to a bottom
 * `SheetActionFooter` (text buttons) on desktop; the Close (X) is always here.
 * A read-only sheet just passes `onClose`.
 */
export function SheetHeader({
  title,
  onClose,
  actions,
}: {
  title: string
  onClose: () => void
  actions?: DialogAction[]
}) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b bg-background px-4 py-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <DialogHeaderActions actions={actions} onClose={onClose} />
    </header>
  )
}

/**
 * Desktop-only bottom action bar for a sheet (hidden on mobile, where the
 * `SheetHeader` icons carry the same actions). Place as the sheet's last child.
 */
export function SheetActionFooter({ actions }: { actions: DialogAction[] }) {
  return <DialogFooterActions actions={actions} />
}

/**
 * Compact empty-state "add" nav-row: an icon + label on the left and a caller-
 * supplied action on the right (e.g. `SidebarMenuAction` with a `+`, or the
 * upload `AddImageMenuAction`). The action lives in `children` so each sheet
 * keeps its own pipeline.
 */
export function SheetAddRow({
  Icon,
  label,
  children,
}: {
  Icon: LucideIcon
  label: string
  children: ReactNode
}) {
  return (
    <div className="relative flex items-center gap-2 border-b px-3 py-2 text-xs">
      <Icon className="size-4 shrink-0" />
      <span>{label}</span>
      {children}
    </div>
  )
}
