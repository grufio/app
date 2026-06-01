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
 * Desktop has no artboard sheet — the EditorNavTree (rendered by
 * `ProjectEditorLeftPanel` directly) is the desktop artboard
 * sidebar. So this scope is mounted only when
 * `isMobile && mobileSection === "artboard"`.
 */
import { useState, type ComponentProps } from "react"

import { MobileArtboardSheet } from "@/features/editor/components/mobile-artboard-sheet"
import { MobileEditButton } from "@/features/editor/components/mobile-edit-button"

type ArtboardSheetProps = Omit<ComponentProps<typeof MobileArtboardSheet>, "onClose">

export type ArtboardSurfaceScopeProps = ArtboardSheetProps

export function ArtboardSurfaceScope(props: ArtboardSurfaceScopeProps) {
  const [editOpen, setEditOpen] = useState(false)

  return (
    <>
      <MobileEditButton onClick={() => setEditOpen(true)} ariaLabel="Edit artboard" />
      {editOpen ? (
        <MobileArtboardSheet {...props} onClose={() => setEditOpen(false)} />
      ) : null}
    </>
  )
}
