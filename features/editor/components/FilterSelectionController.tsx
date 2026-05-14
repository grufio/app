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
  DialogTitle,
} from "@/components/ui/dialog"
import { FILTER_REGISTRY, type RegisteredFilterId } from "@/lib/editor/filters/registry"
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
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)

  const handleApply = () => {
    if (!selectedCardId) return
    const filterType = selectedCardId as FilterType
    onApply(filterType)
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
          <DialogTitle>Filter</DialogTitle>
          <DialogDescription>Select a card.</DialogDescription>
        </DialogHeader>
        <FilterTypeCards
          items={FILTER_CARD_ITEMS.map((item) => ({
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
          <Button onClick={handleApply} disabled={!selectedCardId}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
