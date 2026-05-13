"use client"

/**
 * Mounts the filter selection picker + configure surface. The host
 * owns the post-apply UX: success closes/resets the dialog session,
 * errors land in the console. The shell does not need to wire those
 * trivial bits — they have one valid answer.
 */
import { FilterSelectionController } from "@/features/editor/components/FilterSelectionController"
import { GenericFilterController } from "@/features/editor/components/filter-forms/generic-filter-controller"

export function EditorDialogHost(props: {
  selectionOpen: boolean
  activeFilterType: "pixelate" | null
  filterDialogSource: { sourceImageUrl: string; sourceImageWidth: number; sourceImageHeight: number } | null
  onCloseSelection: () => void
  onSelectFilterType: (filterType: "pixelate") => void
  onCloseConfigure: () => void
  /** Called after a successful filter apply (e.g. to reset the
   * dialog session). The shell wires `filterDialog.reset` here. */
  onApplied: () => void
  onApplyFilter: (args: { filterType: "pixelate"; filterParams: Record<string, unknown> }) => Promise<void>
}) {
  const {
    selectionOpen,
    activeFilterType,
    filterDialogSource,
    onCloseSelection,
    onSelectFilterType,
    onCloseConfigure,
    onApplied,
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
          onSuccess={onApplied}
          onError={(error) => {
            console.error("Failed to apply filter:", error)
          }}
          onApplyFilter={onApplyFilter}
        />
      ) : null}
    </>
  )
}
