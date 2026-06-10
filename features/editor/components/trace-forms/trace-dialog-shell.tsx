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
 * Edit-mode close semantics (mobile): X and Cancel close the **entire**
 * trace flow (call `onCancel`) — same as the preview-header X. The
 * only forward path is Preview → Apply. The Preview button collapses
 * the edit overlay to reveal the live preview; Apply on that preview
 * commits the trace.
 */
import { useState, type ReactNode } from "react"
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react"

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
  /** When set, the active trace is being edited — renders a Delete
   * (Trash2) action in every header variant that removes the trace and
   * closes the dialog. Omitted for the new-trace flow (no icon). */
  onDeleteTrace?: () => void | Promise<void>
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
  onDeleteTrace,
}: Props) {
  const isMobile = useIsMobile()
  // Settings first: the mobile dialog opens on the params overlay; "Preview"
  // collapses it and mounts the preview pane on demand. Once mounted, the
  // pane stays alive across edit/preview round-trips so the canvas + loaded
  // source image survive — only the *first* preview-tap pays the compute.
  // (Desktop shows preview + form side by side from the start.)
  const [editOpen, setEditOpen] = useState(true)
  const [previewMounted, setPreviewMounted] = useState(false)
  // Delete runs the async clear; keep the dialog up with a spinner on
  // the Delete button (mirrors the Apply Check → Loader2) until it
  // resolves and the surface dismisses, so it doesn't switch back early.
  const [deleting, setDeleting] = useState(false)
  const busyOrDeleting = busy || deleting
  const handleDelete = async () => {
    if (busyOrDeleting || !onDeleteTrace) return
    setDeleting(true)
    try {
      await onDeleteTrace()
    } finally {
      setDeleting(false)
    }
  }

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
        <DialogContent
          variant="fullscreen"
          // No built-in close: we render our own X per mode so edit-mode
          // Escape/X dismiss the overlay (not the whole trace flow).
          showCloseButton={false}
          // Escape always closes the entire trace flow — same as the X
          // and Cancel buttons. The forward path (Preview → Apply) is
          // the only intentional way to commit.
          onEscapeKeyDown={(e) => {
            if (editOpen) {
              e.preventDefault()
              onCancel()
            }
          }}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>

          {/* Preview layer — header always rendered (sits under the edit
              overlay until the user collapses it via Preview). The
              preview pane itself is mounted lazily on the first Preview
              tap (`previewMounted`) so no work happens until the user
              asks for it; thereafter it stays mounted to preserve the
              canvas + loaded source. */}
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <span className="text-sm font-medium">{title}</span>
            <div className="ml-auto flex items-center gap-2">
              {onDeleteTrace || deleting ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => void handleDelete()}
                  disabled={busyOrDeleting}
                  aria-label="Delete trace"
                >
                  {deleting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setEditOpen(true)}
                disabled={busyOrDeleting}
                aria-label="Edit parameters"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                onClick={onApply}
                disabled={!valid || busyOrDeleting}
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
                disabled={busyOrDeleting}
                aria-label="Close"
              >
                <X className="size-4" />
              </Button>
            </div>
          </header>
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {previewMounted ? preview : null}
          </main>

          {/* Edit overlay — sits ON TOP of the preview inside the same
              DialogContent (no second Portal, no DismissableLayer
              cascade). The X here closes the entire trace flow (same
              as Cancel below) — the only forward path is Preview. */}
          {editOpen ? (
            <div className="absolute inset-0 z-10 flex flex-col bg-background">
              <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
                <span className="text-sm font-medium">{title}</span>
                <div className="ml-auto flex items-center gap-2">
                  {onDeleteTrace || deleting ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => void handleDelete()}
                      disabled={busyOrDeleting}
                      aria-label="Delete trace"
                    >
                      {deleting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onCancel}
                    disabled={busyOrDeleting}
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
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
                  onClick={onCancel}
                  disabled={busyOrDeleting}
                >
                  Cancel
                </Button>
                {/* Preview commits the in-progress field edit before
                    collapsing the overlay. `useFieldDraft` commits on
                    blur synchronously, but the button tap doesn't
                    reliably blur the focused input on every mobile
                    keyboard (and jsdom never does) — without this the
                    preview underneath would render the pre-edit value
                    for the focused field. */}
                <Button
                  type="button"
                  size="lg"
                  onClick={() => {
                    if (document.activeElement instanceof HTMLElement) {
                      document.activeElement.blur()
                    }
                    setPreviewMounted(true)
                    setEditOpen(false)
                  }}
                  disabled={busyOrDeleting}
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
            {onDeleteTrace || deleting ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto"
                onClick={() => void handleDelete()}
                disabled={busyOrDeleting}
                aria-label="Delete trace"
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
            ) : null}
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
                    disabled={busyOrDeleting}
                  >
                    Cancel
                  </AppButton>
                  <AppButton
                    type="button"
                    onClick={onApply}
                    disabled={!valid || busyOrDeleting}
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
