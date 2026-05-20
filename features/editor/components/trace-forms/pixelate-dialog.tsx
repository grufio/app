"use client"

/**
 * Pixelate trace dialog — strict shadcn sidebar-13 layout
 * ([components/settings-dialog.tsx](components/settings-dialog.tsx)).
 *
 * Thin shell: owns draft params + apply lifecycle, composes the
 * three sub-components inside the standard sidebar-13 skeleton:
 *   - main → header + <PixelatePreviewPane>
 *   - Sidebar (right) → SidebarContent (<PixelateForm>) + SidebarFooter (Apply/Cancel)
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
    displayMmW?: number
    displayMmH?: number
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
        displayMmW,
        displayMmH,
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
          SidebarProvider defaults to `min-h-svh` for full-page nav
          layouts. Inside a Dialog this pushes Sidebar's `h-full` to
          ≈viewport height, clipping `SidebarFooter` (Apply/Cancel)
          past the dialog's overflow-hidden. Override to `min-h-0`.
          Pane is sized to image aspect (no fixed `h-[480px]` on main)
          so the dialog wraps the preview without letterbox below.
        */}
        <SidebarProvider className="items-start min-h-0">
          <main className="flex flex-1 flex-col overflow-hidden">
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
              <span className="text-sm font-medium">Pixelate</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {fmt1(displayMmW)} × {fmt1(displayMmH)} mm
              </span>
            </header>
            <PixelatePreviewPane
              sourceImageUrl={sourceImageUrl}
              displayMmW={displayMmW}
              displayMmH={displayMmH}
              params={draft}
            />
          </main>
          <Sidebar side="right" collapsible="none" className="hidden md:flex">
            <SidebarContent>
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
      </DialogContent>
    </Dialog>
  )
}
