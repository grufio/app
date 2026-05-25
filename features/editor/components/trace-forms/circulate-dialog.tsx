"use client"

/**
 * Circulate trace dialog — same sidebar-13 shell as `PixelateDialog`
 * (full-width header above a preview/main + right-sidebar form row). Thin
 * shell: owns the draft params + apply lifecycle, composes the preview pane,
 * the 3-segment form, and the Apply/Cancel footer.
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
import { circulateSchema, type CirculateParams } from "@/lib/editor/trace/circulate"
import { isCirculateGridValid, resolveCirculateGrid } from "@/lib/editor/trace/circulate-grid-math"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

import { CirculateForm } from "./circulate-form"
import { CirculatePreviewPane } from "./circulate-preview-pane"

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

export function CirculateDialog({
  open,
  sourceImageUrl,
  displayMmW,
  displayMmH,
  onClose,
  onSuccess,
  onApplyTrace,
}: Props) {
  const defaults = useMemo(() => circulateSchema.parse({}) as CirculateParams, [])
  const [draft, setDraft] = useState<CirculateParams>(defaults)
  const [busy, setBusy] = useState(false)

  const setField = <K extends keyof CirculateParams>(key: K, value: CirculateParams[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const grid = useMemo(
    () => resolveCirculateGrid(displayMmW, displayMmH, draft),
    [displayMmW, displayMmH, draft],
  )
  const valid = isCirculateGridValid(grid)

  const handleCancel = () => {
    if (busy) return
    onClose()
  }
  const handleApply = async () => {
    if (busy || !valid) return
    setBusy(true)
    try {
      await onApplyTrace({
        kind: "circulate",
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
      <DialogContent className="overflow-hidden p-0 h-[85vh] md:max-w-[700px] lg:max-w-[800px]">
        <DialogTitle className="sr-only">Circulate</DialogTitle>
        <DialogDescription className="sr-only">
          Bild: {fmt1(displayMmW)} × {fmt1(displayMmH)} mm
        </DialogDescription>

        <div className="flex h-full min-h-0 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <span className="text-sm font-medium">Circulate</span>
            <span className="ml-auto pr-10 text-xs text-muted-foreground">
              <span>Image: {fmt1(displayMmW)} × {fmt1(displayMmH)} mm</span>
              <span className="mx-2">·</span>
              <span>Grid: {grid.cellsX} × {grid.cellsY} cells</span>
              <span className="mx-2">·</span>
              <span>Used: {fmt1(grid.usedMmW)} × {fmt1(grid.usedMmH)} mm</span>
              <span className="mx-2">·</span>
              <span>Cut: {fmt1(grid.borderMmX)} × {fmt1(grid.borderMmY)} mm</span>
            </span>
          </header>

          <SidebarProvider className="items-start min-h-0 flex-1">
            <main className="flex flex-1 flex-col self-stretch overflow-hidden">
              <CirculatePreviewPane
                sourceImageUrl={sourceImageUrl}
                displayMmW={displayMmW}
                displayMmH={displayMmH}
                params={draft}
              />
            </main>
            <Sidebar side="right" collapsible="none" className="hidden md:flex">
              <SidebarContent className="gap-0">
                <CirculateForm params={draft} onParamsChange={setField} disabled={busy} grid={grid} />
              </SidebarContent>
              <SidebarFooter className="border-t p-3">
                <div className="flex justify-between gap-2">
                  <AppButton type="button" variant="outline" onClick={handleCancel} disabled={busy}>
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
