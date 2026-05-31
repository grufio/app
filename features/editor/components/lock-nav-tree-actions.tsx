"use client"

import * as React from "react"
import { Lock, LockOpen, Trash2 } from "lucide-react"

import { SidebarMenuAction, SidebarMenuActions } from "@/components/ui/sidebar"

export type MenuActionResult = { ok: true } | { ok: false; reason?: string }

/**
 * Layer-tree action row for the Image item: Lock + Delete.
 *
 * The lock icon visualises the section-lock invariant derived in
 * `lib/editor/section-locks.ts`. When the image has downstream
 * artefacts (filter / trace), the section is locked and the icon
 * surfaces a `Lock` symbol. Clicking it triggers the cascade-delete
 * flow owned by the parent (`onUnlockRequest`) — that flow handles
 * the confirm dialog + the actual cascade. When nothing downstream
 * exists, the icon shows `LockOpen` and is disabled (nothing to do).
 *
 * `lockToggleable=false` (theoretical: filter-section with no filter
 * but a trace) is greyed out — the only path forward is editing the
 * deeper section that owns the artefact.
 */
export function LockNavTreeActions({
  imageId,
  canDelete,
  locked,
  lockToggleable,
  onDeleteRequest,
  onUnlockRequest,
  onActionError,
}: {
  imageId: string
  canDelete: boolean
  locked: boolean
  lockToggleable: boolean
  onDeleteRequest: (imageId: string) => MenuActionResult | Promise<MenuActionResult>
  onUnlockRequest?: () => void
  onActionError?: (message: string) => void
}) {
  const [busy, setBusy] = React.useState<"delete" | null>(null)
  const disableAll = busy !== null

  const runDelete = React.useCallback(async () => {
    if (busy) return
    setBusy("delete")
    try {
      const out = await onDeleteRequest(imageId)
      if (!out.ok) onActionError?.(out.reason || "Action failed")
    } catch (e) {
      onActionError?.(e instanceof Error ? e.message : "Action failed")
    } finally {
      setBusy(null)
    }
  }, [busy, imageId, onActionError, onDeleteRequest])

  const lockDisabled = !locked || !lockToggleable || disableAll
  const LockIcon = locked ? Lock : LockOpen

  return (
    <SidebarMenuActions>
      <SidebarMenuAction
        inline
        showOnHover={!locked}
        disabled={lockDisabled}
        aria-label={locked ? "Unlock image (deletes filters and trace)" : "Lock (no downstream to protect)"}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (lockDisabled) return
          onUnlockRequest?.()
        }}
      >
        <LockIcon />
      </SidebarMenuAction>
      <SidebarMenuAction
        inline
        showOnHover
        disabled={disableAll || !canDelete}
        aria-busy={busy === "delete"}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          void runDelete()
        }}
        aria-label="Delete Image"
      >
        <Trash2 />
      </SidebarMenuAction>
    </SidebarMenuActions>
  )
}
