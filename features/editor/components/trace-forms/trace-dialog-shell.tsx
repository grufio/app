"use client"

/**
 * Shared shell for the preview+form trace dialogs (Pixelate, Circulate).
 *
 * Desktop (≥ md): sidebar-13 layout — full-width header above a preview/main
 * column + a right `Sidebar` holding the form and the Apply/Cancel footer.
 *
 * Mobile (< md): a SINGLE fullscreen `<Dialog>` with two view modes inside
 * the same `<DialogContent>`. The preview view is always mounted (header
 * with Pencil + Apply + Close, main with the trace mosaic preview). When
 * the user taps Pencil, an Edit overlay is rendered as an absolute
 * `<div>` INSIDE the same DialogContent — same DOM subtree, NOT a second
 * portaled Dialog. The overlay covers the preview visually while leaving
 * its React tree (canvas + ResizeObserver + loaded source image) mounted
 * underneath, so returning to the preview is instant and the canvas keeps
 * its bitmap.
 *
 * Why one Dialog, not two:
 *   The previous mobile shell used a nested `<Dialog>` for the edit
 *   surface. Both Dialogs portaled to `<body>` as siblings, so Radix's
 *   DismissableLayer on the OUTER treated pointer-down inside the INNER
 *   (Cancel/Preview tap) as an outside-interaction → fired the outer's
 *   `onOpenChange(false)` → cascade-closed the whole trace flow back to
 *   the editor. Folding edit into an inline overlay keeps the entire
 *   surface in one DismissableLayer scope, so close semantics are
 *   precise: the built-in close is suppressed (`showCloseButton={false}`)
 *   and explicit header buttons drive each transition — context-aware X
 *   per mode, and Escape is intercepted in edit mode to just dismiss the
 *   overlay.
 *
 * Cancel/Preview in edit mode are functionally identical — both call
 * `setEditOpen(false)`. The labels disambiguate intent ("abort the
 * in-progress field edit" vs. "I'm done, show me the preview"); the
 * draft state lives in the parent and survives either path. The actual
 * filter apply lives exclusively on the outer Apply (check) icon.
 */
import { useState, type ReactNode } from "react"
import { Check, Loader2, Pencil, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  /** Readout entries (image/grid/used/cut): shown as a leading "Trace image"
      section in both the desktop sidebar and the mobile edit overlay. */
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
  // Settings first: the mobile dialog opens on the params overlay; "Preview"
  // (or the header X) collapses it to reveal the live preview, from which the
  // apply icon commits. The preview is mounted underneath from the start, so
  // the collapse is instant. (Desktop shows preview + form side by side.)
  const [editOpen, setEditOpen] = useState(true)

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
        <DialogContent
          variant="fullscreen"
          // No built-in close: we render our own X per mode so edit-mode
          // Escape/X dismiss the overlay (not the whole trace flow).
          showCloseButton={false}
          // Escape in edit mode collapses the overlay back to preview;
          // in preview mode it falls through to Radix → onCancel.
          onEscapeKeyDown={(e) => {
            if (editOpen) {
              e.preventDefault()
              setEditOpen(false)
            }
          }}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>

          {/* Preview layer — always mounted. The header's X here is the
              trace-flow close (calls the shell's `onCancel`). When the
              edit overlay is open it covers this header visually, but the
              preview body (canvas, ResizeObserver, source image) keeps
              running underneath. */}
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <span className="text-sm font-medium">{title}</span>
            <div className="ml-auto flex items-center gap-2">
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onCancel}
                disabled={busy}
                aria-label="Close"
              >
                <X className="size-4" />
              </Button>
            </div>
          </header>
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {preview}
          </main>

          {/* Edit overlay — sits ON TOP of the preview inside the same
              DialogContent (no second Portal, no DismissableLayer
              cascade). Its own X just collapses the overlay; the preview
              underneath is never unmounted. */}
          {editOpen ? (
            <div className="absolute inset-0 z-10 flex flex-col bg-background">
              <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
                <span className="text-sm font-medium">{title}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto"
                  onClick={() => setEditOpen(false)}
                  disabled={busy}
                  aria-label="Back to preview"
                >
                  <X className="size-4" />
                </Button>
              </header>
              {/* Borderless, full-width scroll column: the form's
                  `EditorSidebarSection`s own their `px-4 py-3` + full-width
                  `border-b`, so dividers span 100% with no container
                  padding. The metadata is the leading section, one entry
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
                {/* Preview commits the in-progress field edit before
                    collapsing the overlay. `useFieldDraft` commits on
                    blur synchronously, but the button tap doesn't
                    reliably blur the focused input on every mobile
                    keyboard (and jsdom never does) — without this the
                    preview underneath would render the pre-edit value
                    for the focused field. Cancel intentionally does NOT
                    flush: that's how "discard the in-progress edit" is
                    expressed. */}
                <Button
                  type="button"
                  size="lg"
                  onClick={() => {
                    if (document.activeElement instanceof HTMLElement) {
                      document.activeElement.blur()
                    }
                    setEditOpen(false)
                  }}
                  disabled={busy}
                >
                  Preview
                </Button>
              </DialogStickyFooter>
            </div>
          ) : null}
        </DialogContent>
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
          </header>

          {/* SidebarProvider defaults to `min-h-svh`; override to `min-h-0` so
              the Sidebar's `h-full` stays inside the dialog. */}
          <SidebarProvider className="items-start min-h-0 flex-1">
            <main className="flex flex-1 flex-col self-stretch overflow-hidden">
              {preview}
            </main>
            <Sidebar side="right" collapsible="none" className="hidden md:flex">
              {/* The leading "Trace image" section mirrors the mobile edit
                  overlay (`EditorSidebarSection` with the same readout) so
                  the desktop sidebar and the mobile form share an identical
                  vertical rhythm: image/grid/used/cut on top, form sections
                  below. */}
              <SidebarContent className="gap-0">
                <EditorSidebarSection title="Trace image">
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {metadata.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                </EditorSidebarSection>
                {form}
              </SidebarContent>
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
