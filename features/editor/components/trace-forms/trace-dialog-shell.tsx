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
 *
 * Delete lives ONLY in the section's floating bar (see `EditorTraceBar`), never
 * in this dialog — a single delete affordance per section, always behind a
 * confirm. This shell therefore never renders a Delete action.
 */
import { useState, type ReactNode } from "react"
import { Check, Pencil, X } from "lucide-react"

import { useIsDesktop } from "@/lib/editor/hooks/use-is-desktop"

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
  canPreview,
  onPreviewRequested,
}: Props) {
  // Settings first: the dialog opens on the params overlay; "Preview"
  // collapses it and mounts the preview pane on demand. Once mounted, the
  // pane stays alive across edit/preview round-trips so the canvas + loaded
  // source image survive — only the *first* preview-tap pays the compute.
  const [editOpen, setEditOpen] = useState(true)
  const [previewMounted, setPreviewMounted] = useState(false)
  // Placement, decided ONCE: icons in the header on mobile, text buttons in a
  // footer on desktop. Rendering the actions in exactly one of the two spots
  // (never both) is what prevents the duplicate/ghosted action buttons.
  const isDesktop = useIsDesktop()

  // Preview mode exposes Edit / Apply. Delete is not here — it lives in the
  // section's floating bar, always behind a confirm.
  const previewActions: DialogAction[] = [
    {
      id: "edit",
      label: "Edit",
      ariaLabel: "Edit parameters",
      icon: <Pencil className="size-4" />,
      onClick: () => setEditOpen(true),
      disabled: busy,
      variant: "outline",
    },
    {
      id: "apply",
      label: "Apply",
      ariaLabel: "Apply filter",
      icon: <Check className="size-4" />,
      onClick: onApply,
      disabled: !valid || busy,
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
              actions={isDesktop ? [] : previewActions}
              onClose={onCancel}
              closeLabel="Close"
              closeIcon={<X aria-hidden="true" className="size-4" />}
            />
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {previewMounted ? preview : null}
        </main>
        {/* Desktop footer: the actions as text buttons. Rendered ONLY on
            desktop (mobile carries them as header icons), so a single copy of
            each action exists in the DOM. Covered by the edit overlay while
            it's open. */}
        {isDesktop ? <DialogFooterActions actions={previewActions} /> : null}

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
                  actions={[]}
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
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={onCancel}
                disabled={busy}
              >
                Cancel
              </Button>
              {/* Preview commits the in-progress field edit before
                  collapsing the overlay. `useFieldDraft` commits on blur
                  synchronously, but the button tap doesn't reliably blur the
                  focused input on every mobile keyboard (and jsdom never
                  does) — without this the preview underneath would render the
                  pre-edit value for the focused field.
                  `canPreview === false` DISABLES the button (linerate: nothing
                  changed since the last preview) — it stays in place, greyed,
                  so the footer layout never shifts. undefined/true keeps it
                  enabled, so pixelate/circulate are unchanged. */}
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
                disabled={busy || canPreview === false}
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
