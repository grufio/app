"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MoreVertical } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ProjectCardMenu({
  projectId,
  href,
  className,
}: {
  projectId: string
  href: string
  className?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={
              className ??
              "h-6 w-6 cursor-pointer rounded-full border border-muted-foreground/60 bg-white/80 text-foreground/70 hover:border-[#7C5CFF] hover:bg-white hover:text-foreground"
            }
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
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              router.push(href)
            }}
          >
            Open
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={(e) => {
              e.preventDefault()
              if (busy) return
              setConfirmOpen(true)
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={(o) => (busy ? null : setConfirmOpen(o))}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete this project and all its data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (busy) return
                setBusy(true)
                try {
                  const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE", credentials: "same-origin" })
                  if (!res.ok) {
                    const text = await res.text()
                    throw new Error(text || `Delete failed (${res.status})`)
                  }
                  setConfirmOpen(false)
                  router.refresh()
                } catch (err) {
                  window.alert(err instanceof Error ? err.message : "Delete failed")
                  setBusy(false)
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

