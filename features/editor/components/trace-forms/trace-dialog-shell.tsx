"use client"

/**
 * Shared shell for the preview+form trace dialogs (Pixelate, Circulate).
 *
 * Desktop (≥ md): sidebar-13 layout — full-width header above a preview/main
 * column + a right `Sidebar` holding the form and the Apply/Cancel footer.
 *
 * Mobile (< md): the right sidebar has no room, so the dialog goes
 * edge-to-edge fullscreen showing only the preview plus a header with a close
 * (X) and an "Bearbeiten" button. "Bearbeiten" opens the params in a separate
 * dialog (form + Abbrechen/Anwenden). The draft lives in the parent, so
 * opening/closing the params dialog preserves all field values and the
 * fullscreen preview updates live.
 */
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogStickyFooter,
  DialogTitle,
  FullscreenDialogContent,
} from "@/components/ui/dialog"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { AppButton } from "@/components/ui/form-controls"
import { useIsMobile } from "@/lib/ui/use-mobile"

type Props = {
  open: boolean
  title: string
  /** Screen-reader description for the dialog (sr-only). */
  description: string
  /** Header readout spans (image/grid/used/cut). */
  metadata: ReactNode
  preview: ReactNode
  form: ReactNode
  valid: boolean
  busy: boolean
  onCancel: () => void
  onApply: () => void
}

export function TraceDialogShell({
  open,
  title,
  description,
  metadata,
  preview,
  form,
  valid,
  busy,
  onCancel,
  onApply,
}: Props) {
  const isMobile = useIsMobile()
  const [editOpen, setEditOpen] = useState(false)

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
        <FullscreenDialogContent>
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>

          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <span className="text-sm font-medium">{title}</span>
            {/* mr-10 keeps clear of the absolute close (X) button. */}
            <Button
              type="button"
              variant="outline"
              className="ml-auto mr-10"
              onClick={() => setEditOpen(true)}
              disabled={busy}
            >
              Bearbeiten
            </Button>
          </header>
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {preview}
          </main>
        </FullscreenDialogContent>

        {/* Nested Radix dialog: portals to body (escapes the parent's
            overflow-hidden) and stacks focus correctly over the fullscreen
            preview. Fullscreen too, so the params share the same chrome as
            every other mobile dialog. */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <FullscreenDialogContent>
            <DialogHeader className="shrink-0 border-b p-4 pr-12">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="sr-only">{description}</DialogDescription>
            </DialogHeader>
            {/* No horizontal padding: the form's `EditorSidebarSection`s carry
                their own `px-4` and a full-width `border-b`, so letting them
                span the body edge-to-edge keeps those section dividers 100%
                wide (matching the desktop sidebar). Only the metadata row gets
                its own padding. */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="px-4 py-3 text-xs text-muted-foreground">{metadata}</div>
              {form}
            </div>
            <DialogStickyFooter>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setEditOpen(false)}
                disabled={busy}
              >
                Abbrechen
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={onApply}
                disabled={!valid || busy}
              >
                {busy ? "Wird angewendet…" : "Anwenden"}
              </Button>
            </DialogStickyFooter>
          </FullscreenDialogContent>
        </Dialog>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="overflow-hidden p-0 h-[85vh] md:max-w-[700px] lg:max-w-[800px]">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>

        {/*
          DialogContent uses `grid w-full gap-4` in the shadcn primitive. A
          single flex-col wrapper keeps header + SidebarProvider flush (no 16px
          gap strip); `h-full` makes it fill DialogContent's definite `h-[85vh]`,
          giving the preview pane a definite height chain (SidebarProvider
          `flex-1` → main `self-stretch` → pane flex).
        */}
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <span className="text-sm font-medium">{title}</span>
            <span className="ml-auto pr-10 text-xs text-muted-foreground">
              {metadata}
            </span>
          </header>

          {/* SidebarProvider defaults to `min-h-svh`; override to `min-h-0` so
              the Sidebar's `h-full` stays inside the dialog. */}
          <SidebarProvider className="items-start min-h-0 flex-1">
            <main className="flex flex-1 flex-col self-stretch overflow-hidden">
              {preview}
            </main>
            <Sidebar side="right" collapsible="none" className="hidden md:flex">
              <SidebarContent className="gap-0">{form}</SidebarContent>
              <SidebarFooter className="border-t p-3">
                <div className="flex justify-between gap-2">
                  <AppButton
                    type="button"
                    variant="outline"
                    onClick={onCancel}
                    disabled={busy}
                  >
                    Cancel
                  </AppButton>
                  <AppButton
                    type="button"
                    onClick={onApply}
                    disabled={!valid || busy}
                  >
                    {busy ? "Applying..." : "Apply"}
                  </AppButton>
                </div>
              </SidebarFooter>
            </Sidebar>
          </SidebarProvider>
        </div>
      </DialogContent>
    </Dialog>
  )
}
