"use client"

/**
 * Floating Edit-icon button — mobile-only, positioned top-right of the
 * editor canvas area. Tap opens the management sheet for the currently
 * active section (set via the bottom-nav).
 *
 * Style: round button, white background + thin ring border + drop
 * shadow for depth, Pencil icon centered. Sits at `absolute top-3
 * right-3 z-20` inside `ProjectEditorLayout` (which is `relative`).
 * `md:hidden` keeps it off desktop, where the side panels are the
 * always-open management surface.
 */
import { Pencil } from "lucide-react"

export function MobileEditButton(props: {
  onClick: () => void
  /** Optional override — defaults to "Edit". Pass section-specific
   * label (e.g. "Edit filter") for clearer screen-reader context. */
  ariaLabel?: string
}) {
  const { onClick, ariaLabel = "Edit" } = props
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="absolute top-3 right-3 z-20 inline-flex size-10 items-center justify-center rounded-full border border-white bg-white text-foreground shadow-md ring-1 ring-black/10 transition-transform active:scale-95 md:hidden"
    >
      <Pencil aria-hidden="true" className="size-5" />
    </button>
  )
}
