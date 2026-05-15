"use client"

import * as React from "react"
import { LockOpen, Trash2 } from "lucide-react"

import { SidebarMenuAction, SidebarMenuActions } from "@/components/ui/sidebar"

export type MenuActionResult = { ok: true } | { ok: false; reason?: string }

/**
 * Layer-tree action row. The lock icon is rendered as a static visual
 * placeholder — locking is decoupled from the editor (no DB write, no
 * effect on toolbar / mutations). The `is_locked` column on
 * `project_images` is still present in the schema, but no UI path
 * sets it any more. Delete is the only interactive action here.
 */
export function LockNavTreeActions({
  imageId,
  canDelete,
  onDeleteRequest,
  onActionError,
}: {
  imageId: string
  canDelete: boolean
  onDeleteRequest: (imageId: string) => MenuActionResult | Promise<MenuActionResult>
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

  return (
    <SidebarMenuActions>
      <SidebarMenuAction
        inline
        showOnHover
        disabled
        aria-label="Lock (disabled)"
        aria-disabled
      >
        <LockOpen />
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
