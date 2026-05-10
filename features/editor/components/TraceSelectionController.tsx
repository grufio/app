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
  DialogTitle,
} from "@/components/ui/dialog"
import { TRACE_REGISTRY, type RegisteredTraceId } from "@/lib/editor/trace/registry"

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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trace</DialogTitle>
          <DialogDescription>Pick how to vectorise the image.</DialogDescription>
        </DialogHeader>
        <FilterTypeCards
          items={TRACE_CARD_ITEMS.map((item) => ({
            ...item,
            thumbUrl: workingImageUrl,
          }))}
          selectedId={selectedCardId}
          onSelect={setSelectedCardId}
        />
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
    </Dialog>
  )
}
