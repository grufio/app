"use client"

import { FilterSelectionController } from "@/features/editor/components/FilterSelectionController"
import { GenericFilterController } from "@/features/editor/components/filter-forms/generic-filter-controller"

export function EditorDialogHost(props: {
  selectionOpen: boolean
  activeFilterType: "pixelate" | null
  filterDialogSource: { sourceImageUrl: string; sourceImageWidth: number; sourceImageHeight: number } | null
  onCloseSelection: () => void
  onSelectFilterType: (filterType: "pixelate") => void
  onCloseConfigure: () => void
  onSuccess: () => void
  onError: (error: Error) => void
  onApplyFilter: (args: { filterType: "pixelate"; filterParams: Record<string, unknown> }) => Promise<void>
}) {
  const {
    selectionOpen,
    activeFilterType,
    filterDialogSource,
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
