"use client"

/**
 * Trace picker dialog (F21 PR2). Sister to FilterSelectionController
 * but for the Trace surface — Numerate xor LineArt, mutually
 * exclusive. Re-uses the same FilterTypeCards visual to keep both
 * pickers consistent.
 */
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogStickyFooter,
  DialogTitle,
  FullscreenDialogContent,
} from "@/components/ui/dialog"
import { TRACE_REGISTRY, type RegisteredTraceId } from "@/lib/editor/trace/registry"
import { useIsMobile } from "@/lib/ui/use-mobile"

import { FilterTypeCards } from "./filter-type-cards"

type Props = {
  workingImageUrl: string | null
  open: boolean
  onClose: () => void
  onSelect: (kind: RegisteredTraceId) => void
}

const TRACE_CARD_ITEMS = Object.values(TRACE_REGISTRY).map((t) => ({
  id: t.id as RegisteredTraceId,
  label: t.label,
}))

export function TraceSelectionController({ workingImageUrl, open, onClose, onSelect }: Props) {
  const isMobile = useIsMobile()
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)

  const handleSelect = () => {
    if (!selectedCardId) return
    const kind = selectedCardId as RegisteredTraceId
    onSelect(kind)
    setSelectedCardId(null)
  }

  const handleClose = () => {
    setSelectedCardId(null)
    onClose()
  }

  const items = TRACE_CARD_ITEMS.map((item) => ({ ...item, thumbUrl: workingImageUrl }))

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      {isMobile ? (
        // Fullscreen on mobile (matches the Pixelate/Circulate dialogs): a
        // scrollable tile grid between a sticky header and a sticky
        // Cancel/Select footer. Tiles forced to 2 columns + tighter gap so
        // they stay small on narrow screens.
        <FullscreenDialogContent>
          <DialogHeader className="shrink-0 border-b p-4 pr-12">
            <DialogTitle>Trace</DialogTitle>
            <DialogDescription>Pick how to vectorise the image.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <FilterTypeCards
              items={items}
              selectedId={selectedCardId}
              onSelect={setSelectedCardId}
              className="grid-cols-2 gap-2"
            />
          </div>
          <DialogStickyFooter>
            <Button variant="outline" size="lg" onClick={handleClose}>
              Cancel
            </Button>
            <Button size="lg" onClick={handleSelect} disabled={!selectedCardId}>
              Select
            </Button>
          </DialogStickyFooter>
        </FullscreenDialogContent>
      ) : (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trace</DialogTitle>
            <DialogDescription>Pick how to vectorise the image.</DialogDescription>
          </DialogHeader>
          <FilterTypeCards items={items} selectedId={selectedCardId} onSelect={setSelectedCardId} />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={handleSelect} disabled={!selectedCardId}>
              Select
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
