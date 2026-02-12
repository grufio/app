"use client"

/**
 * Per-project card actions menu.
 *
 * Responsibilities:
 * - Provide contextual actions (e.g. delete) for a project card.
 * - Confirm destructive actions via dialog.
 */
import Link from "next/link"
import { useCallback, useMemo, useState } from "react"
import { MoreVertical } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { deleteProjectClient } from "@/services/projects/client/delete-project"

export function ProjectCardMenu({
  projectId,
  href,
  className,
}: {
  projectId: string
  href: string
  className?: string
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const deleteProject = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const ok = await deleteProjectClient(projectId)
      if (!ok) return
      setConfirmOpen(false)
      // MVP: simplest refresh for server-rendered dashboard list
      window.location.reload()
    } finally {
      setBusy(false)
    }
  }, [busy, projectId])

  const triggerClassName = useMemo(() => {
    return (
      className ??
      "h-6 w-6 cursor-pointer rounded-full border border-muted-foreground/60 bg-white/80 text-foreground/70 hover:border-[#7C5CFF] hover:bg-white hover:text-foreground"
    )
  }, [className])

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={triggerClassName}
            aria-label="Project actions"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            disabled={busy}
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild className="text-[12px]">
            <Link href={href}>Open</Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-[12px]"
            onSelect={(e) => {
              e.preventDefault()
              setConfirmOpen(true)
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={deleteProject} disabled={busy}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

