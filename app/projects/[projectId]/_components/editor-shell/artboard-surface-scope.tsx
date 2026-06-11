"use client"

/**
 * Mobile-only scope for the artboard surface. Owns its `editOpen`
 * state, renders the floating `MobileEditButton` and the
 * `MobileArtboardSheet`. The artboard surface has no dialog state
 * (no `useFilterDialogSession` / `useTraceDialogSession` analogue) —
 * this scope exists to give artboard the same lifecycle-is-
 * dismissal property as the other surfaces: switching to filter or
 * trace unmounts the scope, killing `editOpen` so a re-visit
 * doesn't pop the sheet back open.
 *
 * Mounted on `mobileSection === "artboard"` for both viewports. The
 * `desktop` flag flips the Edit bar + artboard sheet from the mobile
 * fullscreen variant to a bounded floating card on `md+`.
 */
import { useEffect, useState, type ComponentProps } from "react"

import { MobileArtboardSheet } from "@/features/editor/components/mobile-artboard-sheet"
import { MobileTopRightBar } from "@/features/editor/components/mobile-top-right-bar"

type ArtboardSheetProps = Omit<ComponentProps<typeof MobileArtboardSheet>, "onClose" | "desktop">

export type ArtboardSurfaceScopeProps = ArtboardSheetProps & {
  /** When true, render the desktop variant (bounded card, no
   * `md:hidden`). Default false → unchanged mobile fullscreen. */
  desktop?: boolean
  /** Cross-mount request from the top-left artboard "+" menu to open the sheet.
   * Consumed immediately so `editOpen` stays local (revisiting the section
   * doesn't re-pop the sheet). */
  pendingEditOpen?: boolean
  onConsumePendingEditOpen?: () => void
}

export function ArtboardSurfaceScope({
  desktop,
  pendingEditOpen = false,
  onConsumePendingEditOpen,
  ...props
}: ArtboardSurfaceScopeProps) {
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    if (!pendingEditOpen) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditOpen(true)
    onConsumePendingEditOpen?.()
  }, [pendingEditOpen, onConsumePendingEditOpen])

  return (
    <>
      <MobileTopRightBar
        desktop={desktop}
        onEditTap={() => setEditOpen(true)}
        ariaLabelEdit="Edit artboard"
        viewOptions={null}
      />
      {editOpen ? (
        <MobileArtboardSheet {...props} desktop={desktop} onClose={() => setEditOpen(false)} />
      ) : null}
    </>
  )
}
