"use client"

import { FilterSelectionController } from "@/features/editor/components/FilterSelectionController"
import { GenericFilterController } from "@/features/editor/components/filter-forms/generic-filter-controller"

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
      {filterDialogSource && activeFilterType ? (
        <GenericFilterController
          filterId={activeFilterType}
          ctx={{
            imageWidth: filterDialogSource.sourceImageWidth,
            imageHeight: filterDialogSource.sourceImageHeight,
            numerateSuperpixelWidth,
            numerateSuperpixelHeight,
          }}
          open
          onClose={onCloseConfigure}
          onSuccess={onSuccess}
          onError={onError}
          onApplyFilter={onApplyFilter}
        />
      ) : null}
    </>
  )
}
