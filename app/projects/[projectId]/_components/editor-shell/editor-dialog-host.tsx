"use client"

import { FilterSelectionController } from "@/features/editor/components/FilterSelectionController"
import { LineArtFilterController } from "@/features/editor/components/LineArtFilterController"
import { NumerateFilterController } from "@/features/editor/components/NumerateFilterController"
import { PixelateFilterController } from "@/features/editor/components/PixelateFilterController"

export function EditorDialogHost(props: {
  selectionOpen: boolean
  activeFilterType: "pixelate" | "lineart" | "numerate" | null
  filterDialogSource: { sourceImageUrl: string; sourceImageWidth: number; sourceImageHeight: number } | null
  numerateSuperpixelWidth: number
  numerateSuperpixelHeight: number
  onCloseSelection: () => void
  onSelectFilterType: (filterType: "pixelate" | "lineart" | "numerate") => void
  onCloseConfigure: () => void
  onSuccess: () => void
  onError: (error: Error) => void
  onApplyFilter: (args: { filterType: "pixelate" | "lineart" | "numerate"; filterParams: Record<string, unknown> }) => Promise<void>
}) {
  const {
    selectionOpen,
    activeFilterType,
    filterDialogSource,
    numerateSuperpixelWidth,
    numerateSuperpixelHeight,
    onCloseSelection,
    onSelectFilterType,
    onCloseConfigure,
    onSuccess,
    onError,
    onApplyFilter,
  } = props

  return (
    <>
      <FilterSelectionController
        workingImageUrl={filterDialogSource?.sourceImageUrl ?? null}
        open={selectionOpen}
        onClose={onCloseSelection}
        onSelect={onSelectFilterType}
      />
      {filterDialogSource ? (
        <>
          <PixelateFilterController
            workingImageWidth={filterDialogSource.sourceImageWidth}
            workingImageHeight={filterDialogSource.sourceImageHeight}
            open={activeFilterType === "pixelate"}
            onClose={onCloseConfigure}
            onSuccess={onSuccess}
            onError={onError}
            onApplyFilter={onApplyFilter}
          />
          <LineArtFilterController
            open={activeFilterType === "lineart"}
            onClose={onCloseConfigure}
            onSuccess={onSuccess}
            onError={onError}
            onApplyFilter={onApplyFilter}
          />
          <NumerateFilterController
            superpixelWidth={numerateSuperpixelWidth}
            superpixelHeight={numerateSuperpixelHeight}
            open={activeFilterType === "numerate"}
            onClose={onCloseConfigure}
            onSuccess={onSuccess}
            onError={onError}
            onApplyFilter={onApplyFilter}
          />
        </>
      ) : null}
    </>
  )
}
