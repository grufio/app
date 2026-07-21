"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogStickyFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatOperationErrorForToast, normalizeApiError } from "@/lib/api/error-normalizer"
import { FILTER_REGISTRY, type RegisteredFilterId } from "@/lib/editor/filters/registry"

import { FilterTypeCards } from "./filter-type-cards"

type FilterType = RegisteredFilterId

type Props = {
  workingImageUrl: string | null
  open: boolean
  onClose: () => void
  /** Applies the picked filter. The B&W filters have no configurable params,
   * so picking a card + Apply is the whole interaction — no separate configure
   * step. Returns a promise that settles when the apply completes: the picker
   * stays open + busy until then (owns its own feedback, like the trace dialog),
   * so no canvas overlay is needed. */
  onApply: (filterType: FilterType) => Promise<void>
}

const FILTER_CARD_ITEMS = Object.values(FILTER_REGISTRY).map((f) => ({
  id: f.id as FilterType,
  label: f.label,
}))

export function FilterSelectionController({
  workingImageUrl,
  open,
  onClose,
  onApply,
}: Props) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleClose = () => {
    if (busy) return
    setSelectedCardId(null)
    onClose()
  }

  // Await the apply and keep the picker open + busy until it settles — the
  // dialog owns the feedback (like the trace dialogs), so there's no canvas
  // overlay to leak. On failure the picker toasts and stays open for a retry
  // (the machine allows re-apply straight out of `error`).
  const handleApply = async () => {
    if (!selectedCardId || busy) return
    setBusy(true)
    try {
      await onApply(selectedCardId as FilterType)
      setSelectedCardId(null)
      onClose()
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      const formatted = formatOperationErrorForToast(normalizeApiError(error))
      toast.error(formatted.title, formatted.detail ? { description: formatted.detail } : undefined)
    } finally {
      setBusy(false)
    }
  }

  const items = FILTER_CARD_ITEMS.map((item) => ({ ...item, thumbUrl: workingImageUrl }))

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      {/* Fullscreen on every viewport (desktop matches mobile): sticky
          header, scrollable 2-col card grid, sticky footer. */}
      <DialogContent variant="fullscreen" aria-describedby={undefined}>
        <DialogHeader className="shrink-0 border-b p-4 pr-12">
          <DialogTitle>Filter</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <FilterTypeCards
            items={items}
            selectedId={selectedCardId}
            onSelect={busy ? undefined : setSelectedCardId}
            className="grid-cols-2 gap-2"
          />
        </div>
        <DialogStickyFooter>
          <Button variant="outline" size="lg" onClick={handleClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="lg" onClick={() => void handleApply()} disabled={!selectedCardId || busy}>
            {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
            Apply
          </Button>
        </DialogStickyFooter>
      </DialogContent>
    </Dialog>
  )
}
