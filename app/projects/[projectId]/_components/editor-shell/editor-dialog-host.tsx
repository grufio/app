"use client"

/**
 * Mounts the filter selection picker. Post the B&W-filter-triad
 * refactor there is no configure step — all filters are no-config
 * presets, so picking a card + clicking Apply in the dialog footer
 * applies it directly. The host just bridges the picker's `onApply`
 * to the shell's `onApplyFilter` with an empty params object.
 */
import { FilterSelectionController } from "@/features/editor/components/FilterSelectionController"
import type { RegisteredFilterId } from "@/lib/editor/filters/registry"

export function EditorDialogHost(props: {
  selectionOpen: boolean
  filterDialogSource: { sourceImageUrl: string; sourceImageWidth: number; sourceImageHeight: number } | null
  onCloseSelection: () => void
  onApplyFilter: (args: { filterType: RegisteredFilterId; filterParams: Record<string, unknown> }) => Promise<void>
}) {
  const { selectionOpen, filterDialogSource, onCloseSelection, onApplyFilter } = props

  return (
    <FilterSelectionController
      workingImageUrl={filterDialogSource?.sourceImageUrl ?? null}
      open={selectionOpen}
      onClose={onCloseSelection}
      onApply={(filterType) => {
        void onApplyFilter({ filterType, filterParams: {} })
      }}
    />
  )
}
