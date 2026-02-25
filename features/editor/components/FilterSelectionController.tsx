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
import { FilterTypeCards } from "./filter-type-cards"

type FilterType = "pixelate" | "lineart" | "numerate"

type Props = {
  workingImageUrl: string | null
  open: boolean
  onClose: () => void
  onSelect: (filterType: FilterType) => void
}

const FILTER_CARD_ITEMS = [
  { id: "pixelate" as const, label: "Pixelate" },
  { id: "lineart" as const, label: "Line Art" },
  { id: "numerate" as const, label: "Numerate" },
]

export function FilterSelectionController({
  workingImageUrl,
  open,
  onClose,
  onSelect,
}: Props) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)

  const handleSelect = () => {
    if (!selectedCardId) return
    const filterType = selectedCardId as FilterType
    onSelect(filterType)
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
          <Button onClick={handleSelect} disabled={!selectedCardId}>
            Select
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
