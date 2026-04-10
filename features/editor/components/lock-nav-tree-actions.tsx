"use client"

import * as React from "react"
import { Lock, LockOpen, Trash2 } from "lucide-react"

import { SidebarMenuAction, SidebarMenuActions } from "@/components/ui/sidebar"

export type MenuActionResult = { ok: true } | { ok: false; reason?: string }

export function LockNavTreeActions({
  imageId,
  locked,
  canDelete,
  onToggleLocked,
  onDeleteRequest,
  onActionError,
}: {
  imageId: string
  locked: boolean
  canDelete: boolean
  onToggleLocked: (imageId: string, nextLocked: boolean) => MenuActionResult | Promise<MenuActionResult>
  onDeleteRequest: (imageId: string) => MenuActionResult | Promise<MenuActionResult>
  onActionError?: (message: string) => void
}) {
  const [busy, setBusy] = React.useState<"lock" | "delete" | null>(null)
  const disableAll = busy !== null

  const runAction = React.useCallback(
    async (kind: "lock" | "delete", run: () => MenuActionResult | Promise<MenuActionResult>) => {
      if (busy) return
      setBusy(kind)
      try {
        const out = await run()
        if (!out.ok) onActionError?.(out.reason || "Action failed")
      } catch (e) {
        onActionError?.(e instanceof Error ? e.message : "Action failed")
      } finally {
        setBusy(null)
      }
    },
    [busy, onActionError]
  )

  return (
    <SidebarMenuActions>
      <SidebarMenuAction
        inline
        showOnHover={!locked}
        disabled={disableAll}
        aria-busy={busy === "lock"}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          void runAction("lock", () => onToggleLocked(imageId, !locked))
        }}
        aria-label={locked ? "Unlock Image" : "Lock Image"}
        aria-pressed={locked}
      >
        {locked ? <Lock /> : <LockOpen />}
      </SidebarMenuAction>
      <SidebarMenuAction
        inline
        showOnHover
        disabled={disableAll}
        aria-busy={busy === "delete"}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          void runAction("delete", () => onDeleteRequest(imageId))
        }}
        aria-label="Delete Image"
      >
        <Trash2 />
      </SidebarMenuAction>
    </SidebarMenuActions>
  )
}

