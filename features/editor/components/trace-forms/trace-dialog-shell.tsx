"use client"

/**
 * Shared shell for the preview+form trace dialogs (Pixelate, Circulate).
 *
 * Desktop (≥ md): sidebar-13 layout — full-width header above a preview/main
 * column + a right `Sidebar` holding the form and the Apply/Cancel footer.
 *
 * Mobile (< md): the right sidebar has no room, so the dialog goes
 * edge-to-edge fullscreen showing only the preview plus a header with the
 * close (X), an edit (pencil) icon, and an apply (check) icon. The pencil
 * opens the params in a separate dialog (form + Cancel/Preview). Preview
 * only dismisses the edit dialog — apply is committed exclusively from the
 * outer preview's check icon, so the user always sees the final preview
 * state before the filter is fired. Draft state lives in the parent, so
 * opening/closing the edit dialog preserves all field values and the
 * fullscreen preview updates live.
 */
import { Fragment, useState, type ReactNode } from "react"
import { Check, Loader2, Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogStickyFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { AppButton } from "@/components/ui/form-controls"
import { useIsMobile } from "@/lib/ui/use-mobile"

import { EditorSidebarSection } from "../sidebar/editor-sidebar-section"

type Props = {
  open: boolean
  title: string
  /** Screen-reader description for the dialog (sr-only). */
  description: string
  /** Readout entries (image/grid/used/cut): inline on desktop, one per line in
      the mobile "Trace image" section. */
  metadata: readonly string[]
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
        <DialogContent variant="fullscreen">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>

          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <span className="text-sm font-medium">{title}</span>
            {/* mr-10 keeps clear of the absolute close (X) button. */}
            <div className="ml-auto mr-10 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setEditOpen(true)}
                disabled={busy}
                aria-label="Edit parameters"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                onClick={onApply}
                disabled={!valid || busy}
                aria-label="Apply filter"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
              </Button>
            </div>
          </header>
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {preview}
          </main>
        </DialogContent>

        {/* Nested Radix dialog: portals to body (escapes the parent's
            overflow-hidden) and stacks focus correctly over the fullscreen
            preview. Fullscreen too, so the params share the same chrome as
            every other mobile dialog. */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent variant="fullscreen">
            <DialogHeader className="shrink-0 border-b p-4 pr-12">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="sr-only">{description}</DialogDescription>
            </DialogHeader>
            {/* Borderless, full-width scroll column: the form's
                `EditorSidebarSection`s own their `px-4 py-3` + full-width
                `border-b`, so their dividers span 100% with no container
                padding. The metadata is its own leading section, one entry
                per line, sharing that same rhythm. */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <EditorSidebarSection title="Trace image">
                <div className="space-y-1 text-xs text-muted-foreground">
                  {metadata.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </EditorSidebarSection>
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
                Cancel
              </Button>
              {/* Preview only dismisses the edit dialog — the actual apply
                  lives on the outer preview's check icon, so the user reviews
                  the final preview before firing the filter. `!valid` is
                  intentionally NOT a gate here: even with an invalid grid the
                  user can return to the preview. */}
              <Button
                type="button"
                size="lg"
                onClick={() => setEditOpen(false)}
                disabled={busy}
              >
                Preview
              </Button>
            </DialogStickyFooter>
          </DialogContent>
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
              {metadata.map((item, i) => (
                <Fragment key={item}>
                  {i > 0 && <span className="mx-2">·</span>}
                  <span>{item}</span>
                </Fragment>
              ))}
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
