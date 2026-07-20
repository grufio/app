"use client"

/**
 * Responsive dialog actions — one data model, two placements.
 *
 * The editor dialogs present their non-close functions differently per
 * viewport:
 *   - MOBILE (`< md`): icon buttons in the top header (as before).
 *   - DESKTOP (`≥ md`): only the Close (X) stays top-right; the other functions
 *     move to a bottom bar rendered as TEXT buttons (written-out names).
 *
 * Callers define the actions once (`DialogAction[]`) and place both pieces:
 * `DialogHeaderActions` in the header and `DialogFooterActions` at the bottom.
 * The header hides its icon group at `md`; the footer shows only at `md` — so
 * exactly one representation is visible at a time. The Close button is separate
 * and always visible in the header.
 */
import { Loader2, X } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type DialogAction = {
  id: string
  /** Written-out name — the desktop text button's visible label. */
  label: string
  /** Accessible name for the mobile icon button. Defaults to `label`; set it
   * when the icon needs a more descriptive label than the short desktop text
   * (e.g. label "Apply", ariaLabel "Apply filter"). */
  ariaLabel?: string
  /** Mobile icon node (caller sets its own size class). */
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  /** In-flight: swaps the icon for a spinner and disables the button. */
  busy?: boolean
  variant?: "default" | "outline" | "ghost"
}

/**
 * Header slot: non-close actions as icon buttons (mobile only), plus the
 * always-visible Close (X). On desktop the icon group is hidden — only Close
 * remains — and the actions surface via `DialogFooterActions`.
 */
export function DialogHeaderActions({
  actions = [],
  onClose,
  closeLabel = "Close",
  closeIcon,
}: {
  actions?: DialogAction[]
  onClose: () => void
  closeLabel?: string
  closeIcon?: ReactNode
}) {
  return (
    <div className="flex items-center gap-1">
      {actions.length > 0 ? (
        <div className="flex items-center gap-1 md:hidden">
          {actions.map((action) => (
            <Button
              key={action.id}
              type="button"
              variant={action.variant ?? "ghost"}
              size="icon"
              aria-label={action.ariaLabel ?? action.label}
              onClick={action.onClick}
              disabled={action.disabled || action.busy}
            >
              {action.busy ? <Loader2 className="size-5 animate-spin" /> : action.icon}
            </Button>
          ))}
        </div>
      ) : null}
      <Button type="button" variant="ghost" size="icon" aria-label={closeLabel} onClick={onClose}>
        {closeIcon ?? <X aria-hidden="true" className="size-5" />}
      </Button>
    </div>
  )
}

/**
 * Footer slot: the same actions as full-width-ish TEXT buttons, desktop only.
 * Hidden on mobile (where the header icons carry them). Renders nothing when
 * there are no actions (e.g. a read-only dialog with just Close).
 */
export function DialogFooterActions({
  actions,
  className,
}: {
  actions: DialogAction[]
  className?: string
}) {
  if (actions.length === 0) return null
  return (
    <div className={cn("hidden shrink-0 items-center justify-end gap-2 border-t p-3 md:flex", className)}>
      {actions.map((action) => (
        <Button
          key={action.id}
          type="button"
          variant={action.variant ?? "default"}
          size="lg"
          onClick={action.onClick}
          disabled={action.disabled || action.busy}
        >
          {action.busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
          {action.label}
        </Button>
      ))}
    </div>
  )
}
