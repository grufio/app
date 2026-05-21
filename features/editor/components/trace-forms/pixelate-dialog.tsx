"use client"

/**
 * Pixelate trace dialog — sidebar-13 layout with a **full-width
 * header** above the sidebar/main row. The shadcn `sidebar-13`
 * template puts the header inside `main` (so it's the main column's
 * width only); we lift it out so it spans the dialog regardless of
 * sidebar width.
 *
 * Thin shell: owns draft params + apply lifecycle, composes:
 *   - header → title + size readout + auto close button
 *   - SidebarProvider →
 *       - main → <PixelatePreviewPane>
 *       - Sidebar (right) → SidebarContent (<PixelateForm>)
 *                         + SidebarFooter (Apply/Cancel)
 */
import { useMemo, useState } from "react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { AppButton } from "@/components/ui/form-controls"
import { formatOperationErrorForToast, normalizeApiError } from "@/lib/api/error-normalizer"
import { pixelateSchema, type PixelateParams } from "@/lib/editor/trace/pixelate"
import { isPixelateGridValid, resolvePixelateGrid } from "@/lib/editor/trace/pixelate-grid-math"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

import { PixelateForm } from "./pixelate-form"
import { PixelatePreviewPane } from "./pixelate-preview-pane"

type Props = {
  open: boolean
  sourceImageUrl: string
  displayMmW: number
  displayMmH: number
  onClose: () => void
  onSuccess: () => void
  onApplyTrace: (args: {
    kind: RegisteredTraceId
    params: Record<string, unknown>
  }) => Promise<void>
}

function fmt1(n: number): string {
  return n.toFixed(1)
}

export function PixelateDialog({
  open,
  sourceImageUrl,
  displayMmW,
  displayMmH,
  onClose,
  onSuccess,
  onApplyTrace,
}: Props) {
  const defaults = useMemo(() => pixelateSchema.parse({}) as PixelateParams, [])
  const [draft, setDraft] = useState<PixelateParams>(defaults)
  const [busy, setBusy] = useState(false)

  const setField = <K extends keyof PixelateParams>(key: K, value: PixelateParams[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const grid = useMemo(
    () => resolvePixelateGrid(displayMmW, displayMmH, draft),
    [displayMmW, displayMmH, draft],
  )
  const valid = isPixelateGridValid(grid)

  const handleCancel = () => {
    if (busy) return
    onClose()
  }
  const handleApply = async () => {
    if (busy || !valid) return
    setBusy(true)
    try {
      await onApplyTrace({
        kind: "pixelate",
        params: draft as Record<string, unknown>,
      })
      onSuccess()
      onClose()
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      console.error("Failed to apply trace:", error)
      const formatted = formatOperationErrorForToast(normalizeApiError(error))
      toast.error(formatted.title, formatted.detail ? { description: formatted.detail } : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent className="overflow-hidden p-0 md:max-h-[85vh] md:max-w-[700px] lg:max-w-[800px]">
        <DialogTitle className="sr-only">Pixelate</DialogTitle>
        <DialogDescription className="sr-only">
          Bild: {fmt1(displayMmW)} × {fmt1(displayMmH)} mm
        </DialogDescription>

        {/*
          DialogContent uses `grid w-full gap-4` in the shadcn
          primitive. With header + SidebarProvider as sibling grid
          items there'd be a visible 16px strip between them. A
          single flex-col wrapper keeps them flush.

          The DialogContent's auto close button sits at `absolute
          top-2 right-2` and lands inside this header bar.
        */}
        <div className="flex min-h-0 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <span className="text-sm font-medium">Pixelate</span>
            <span className="ml-auto pr-10 text-xs text-muted-foreground">
              {fmt1(displayMmW)} × {fmt1(displayMmH)} mm
            </span>
          </header>

          {/*
            SidebarProvider defaults to `min-h-svh` for full-page nav
            layouts. Inside a Dialog this pushes Sidebar's `h-full`
            to ≈viewport height, clipping `SidebarFooter` past the
            dialog's overflow. Override to `min-h-0`.
          */}
          <SidebarProvider className="items-start min-h-0">
            <main className="flex flex-1 flex-col overflow-hidden">
              <PixelatePreviewPane
                sourceImageUrl={sourceImageUrl}
                displayMmW={displayMmW}
                displayMmH={displayMmH}
                params={draft}
              />
            </main>
            <Sidebar side="right" collapsible="none" className="hidden md:flex">
              <SidebarContent className="gap-0">
                <PixelateForm
                  params={draft}
                  onParamsChange={setField}
                  disabled={busy}
                  grid={grid}
                />
              </SidebarContent>
              <SidebarFooter className="border-t p-3">
                <div className="flex justify-between gap-2">
                  <AppButton
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={busy}
                  >
                    Cancel
                  </AppButton>
                  <AppButton
                    type="button"
                    onClick={() => void handleApply()}
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
