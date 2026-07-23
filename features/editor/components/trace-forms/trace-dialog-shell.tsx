"use client"

/**
 * Shared shell for the preview+form trace dialogs (Pixelate, Circulate).
 *
 * Unified across viewports (desktop matches mobile): a SINGLE fullscreen
 * `<Dialog>` with two view modes inside the same `<DialogContent>`. The
 * preview view is always mounted (header with Pencil + Apply + Close, main
 * with the trace mosaic preview). When the user taps Pencil, an Edit overlay
 * is rendered as an absolute `<div>` INSIDE the same DialogContent — same DOM
 * subtree, NOT a second portaled Dialog. The overlay covers the preview
 * visually while leaving its React tree (canvas + ResizeObserver + loaded
 * source image) mounted underneath, so returning to the preview is instant
 * and the canvas keeps its bitmap.
 *
 * Why one Dialog, not two:
 *   A nested `<Dialog>` for the edit surface portals to `<body>` as a sibling,
 *   so Radix's DismissableLayer on the OUTER treats pointer-down inside the
 *   INNER (Cancel/Preview tap) as an outside-interaction → fires the outer's
 *   `onOpenChange(false)` → cascade-closes the whole trace flow. Folding edit
 *   into an inline overlay keeps the entire surface in one DismissableLayer
 *   scope, so close semantics are precise: the built-in close is suppressed
 *   (`showCloseButton={false}`) and explicit header buttons drive each
 *   transition — context-aware X per mode, and Escape is intercepted in edit
 *   mode to just dismiss the overlay.
 *
 * Edit-mode close semantics: X and Cancel close the **entire** trace flow
 * (call `onCancel`) — same as the preview-header X. The only forward path is
 * Preview → Apply. The Preview button collapses the edit overlay to reveal the
 * live preview; Apply on that preview commits the trace.
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

import { DialogFooterActions, DialogHeaderActions, type DialogAction } from "../dialog-action-controls"
import { EditorSidebarSection } from "../sidebar/editor-sidebar-section"

type Props = {
  open: boolean
  title: string
  /** Screen-reader description for the dialog (sr-only). */
  description: string
  /** Readout entries (image/grid/used/cut): shown as a leading "Trace image"
      section in the edit overlay. */
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
  /** Opt-in preview-button gate. When `false`, the edit-overlay's Preview
   * button is NOT rendered (used by linerate to hide it once nothing changed
   * since the last preview). `undefined`/`true` → always rendered, so
   * pixelate/circulate keep their current behaviour. */
  canPreview?: boolean
  /** Opt-in preview trigger. Called (in addition to the mount/collapse) when
   * the Preview button is tapped, so the owning dialog can bump a preview
   * generation. Undefined for pixelate/circulate (no server preview). */
  onPreviewRequested?: () => void
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
  canPreview,
  onPreviewRequested,
}: Props) {
  // Settings first: the dialog opens on the params overlay; "Preview"
  // collapses it and mounts the preview pane on demand. Once mounted, the
  // pane stays alive across edit/preview round-trips so the canvas + loaded
  // source image survive — only the *first* preview-tap pays the compute.
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

  // Responsive actions: icons in the header on mobile, text buttons in a footer
  // on desktop (see `dialog-action-controls`). Close (X) stays in the header.
  const deleteAction: DialogAction | null =
    onDeleteTrace || deleting
      ? {
          id: "delete",
          label: "Delete",
          ariaLabel: "Delete trace",
          icon: <Trash2 className="size-4" />,
          onClick: () => void handleDelete(),
          disabled: busyOrDeleting,
          busy: deleting,
          variant: "ghost",
        }
      : null
  // Preview mode exposes Delete / Edit / Apply.
  const previewActions: DialogAction[] = [
    ...(deleteAction ? [deleteAction] : []),
    {
      id: "edit",
      label: "Edit",
      ariaLabel: "Edit parameters",
      icon: <Pencil className="size-4" />,
      onClick: () => setEditOpen(true),
      disabled: busyOrDeleting,
      variant: "outline",
    },
    {
      id: "apply",
      label: "Apply",
      ariaLabel: "Apply filter",
      icon: <Check className="size-4" />,
      onClick: onApply,
      disabled: !valid || busyOrDeleting,
      busy,
      variant: "default",
    },
  ]

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
            overlay until the user collapses it via Preview). The preview
            pane itself is mounted lazily on the first Preview tap
            (`previewMounted`) so no work happens until the user asks for
            it; thereafter it stays mounted to preserve the canvas + loaded
            source. */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <span className="text-sm font-medium">{title}</span>
          <div className="ml-auto">
            <DialogHeaderActions
              actions={previewActions}
              onClose={onCancel}
              closeLabel="Close"
              closeIcon={<X aria-hidden="true" className="size-4" />}
            />
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {previewMounted ? preview : null}
        </main>
        {/* Desktop footer: the header's function icons rendered as text buttons
            (hidden on mobile). Covered by the edit overlay while it's open. */}
        <DialogFooterActions actions={previewActions} />

        {/* Edit overlay — sits ON TOP of the preview inside the same
            DialogContent (no second Portal, no DismissableLayer cascade).
            The X here closes the entire trace flow (same as Cancel below) —
            the only forward path is Preview. */}
        {editOpen ? (
          <div className="absolute inset-0 z-10 flex flex-col bg-background">
            <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
              <span className="text-sm font-medium">{title}</span>
              <div className="ml-auto">
                <DialogHeaderActions
                  actions={deleteAction ? [deleteAction] : []}
                  onClose={onCancel}
                  closeLabel="Close"
                  closeIcon={<X aria-hidden="true" className="size-4" />}
                />
              </div>
            </header>
            {/* Borderless, full-width scroll column: the form's
                `EditorSidebarSection`s own their `px-4 py-3` + full-width
                `border-b`, so dividers span 100% with no container padding.
                The metadata is the leading section, one entry per line,
                sharing that same rhythm. */}
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
              {/* Desktop-only Delete text button — on mobile Delete is the icon
                  in the header, so this stays hidden and Cancel/Preview keep
                  their spread (justify-between) layout unchanged. */}
              {deleteAction ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="hidden md:inline-flex"
                  onClick={() => void handleDelete()}
                  disabled={busyOrDeleting}
                >
                  {deleting ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
                  Delete
                </Button>
              ) : null}
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
                  collapsing the overlay. `useFieldDraft` commits on blur
                  synchronously, but the button tap doesn't reliably blur the
                  focused input on every mobile keyboard (and jsdom never
                  does) — without this the preview underneath would render the
                  pre-edit value for the focused field.
                  `canPreview === false` hides the button (linerate: nothing
                  changed since the last preview); undefined/true keeps it, so
                  pixelate/circulate are unchanged. */}
              {canPreview === false ? null : (
                <Button
                  type="button"
                  size="lg"
                  onClick={() => {
                    if (document.activeElement instanceof HTMLElement) {
                      document.activeElement.blur()
                    }
                    onPreviewRequested?.()
                    setPreviewMounted(true)
                    setEditOpen(false)
                  }}
                  disabled={busyOrDeleting}
                >
                  Preview
                </Button>
              )}
            </DialogStickyFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
