"use client"

/**
 * Responsive dialog actions — one data model, two placements.
 *
 * The editor dialogs present their non-close functions differently per
 * viewport:
 *   - MOBILE (`< md`): icon buttons in the top header.
 *   - DESKTOP (`≥ md`): only the Close (X) stays top-right; the other functions
 *     move to a bottom bar rendered as TEXT buttons (written-out names).
 *
 * Callers define the actions once (`DialogAction[]`) and place both pieces:
 * `DialogHeaderActions` in the header and `DialogFooterActions` at the bottom.
 * Each piece self-selects by viewport via `useIsMobile()`, so **exactly one
 * representation is ever mounted** — the other is not in the DOM at all. This
 * replaces the previous CSS approach (`md:hidden` / `hidden md:flex`), where the
 * hidden copy lingered as `display:none` and could be surfaced or double-painted
 * by the browser, and where two mounted copies could drift out of state. The
 * Close button is separate and always visible in the header on both viewports.
 */
import { Loader2, X } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/lib/ui/use-mobile"
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
 * always-visible Close (X). On desktop the icon group is not rendered — only
 * Close remains — and the actions surface via `DialogFooterActions`.
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
  const isMobile = useIsMobile()
  return (
    <div className="flex items-center gap-1">
      {isMobile && actions.length > 0 ? (
        <div className="flex items-center gap-1">
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
 * Not rendered on mobile (where the header icons carry them). Renders nothing
 * when there are no actions (e.g. a read-only dialog with just Close).
 */
export function DialogFooterActions({
  actions,
  className,
}: {
  actions: DialogAction[]
  className?: string
}) {
  // Hook first (Rules of Hooks): must run before any early return.
  const isMobile = useIsMobile()
  if (isMobile || actions.length === 0) return null
  return (
    <div className={cn("flex shrink-0 items-center justify-end gap-2 border-t p-3", className)}>
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
