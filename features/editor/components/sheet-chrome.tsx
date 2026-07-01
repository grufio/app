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
import { Check, X, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Sheet title-bar: the section title + a ghost Close button. When `onConfirm`
 * is provided, a Check ("confirm / done") button is shown next to Close —
 * clicking it blurs the focused field (committing any pending input) and runs
 * the confirm handler.
 */
export function SheetHeader({
  title,
  onClose,
  onConfirm,
}: {
  title: string
  onClose: () => void
  onConfirm?: () => void
}) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b bg-background px-4 py-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="flex items-center gap-1">
        {onConfirm ? (
          <Button type="button" variant="ghost" size="icon" aria-label="Confirm" onClick={onConfirm}>
            <Check aria-hidden="true" className="size-5" />
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X aria-hidden="true" className="size-5" />
        </Button>
      </div>
    </header>
  )
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
