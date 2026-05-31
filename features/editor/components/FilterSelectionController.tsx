"use client"

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
} from "@/components/ui/dialog"
import { FILTER_REGISTRY, type RegisteredFilterId } from "@/lib/editor/filters/registry"
import { useIsMobile } from "@/lib/ui/use-mobile"

import { FilterTypeCards } from "./filter-type-cards"

type FilterType = RegisteredFilterId

type Props = {
  workingImageUrl: string | null
  open: boolean
  onClose: () => void
  /** Applies the picked filter directly. The B&W filters have no
   * configurable params, so picking a card + clicking Apply is the
   * whole interaction — there is no separate configure step. */
  onApply: (filterType: FilterType) => void
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
  const isMobile = useIsMobile()
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)

  const handleClose = () => {
    setSelectedCardId(null)
    onClose()
  }

  const handleApply = () => {
    if (!selectedCardId) return
    onApply(selectedCardId as FilterType)
    handleClose()
  }

  const items = FILTER_CARD_ITEMS.map((item) => ({ ...item, thumbUrl: workingImageUrl }))

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      {isMobile ? (
        // Fullscreen on mobile (matches the Trace picker): sticky header,
        // scrollable 2-col card grid, sticky footer with big touch targets.
        <DialogContent variant="fullscreen">
          <DialogHeader className="shrink-0 border-b p-4 pr-12">
            <DialogTitle>Filter</DialogTitle>
            <DialogDescription>Select a card.</DialogDescription>
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
            <Button size="lg" onClick={handleApply} disabled={!selectedCardId}>
              Apply
            </Button>
          </DialogStickyFooter>
        </DialogContent>
      ) : (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filter</DialogTitle>
            <DialogDescription>Select a card.</DialogDescription>
          </DialogHeader>
          <FilterTypeCards items={items} selectedId={selectedCardId} onSelect={setSelectedCardId} />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={handleApply} disabled={!selectedCardId}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
