"use client"

/**
 * Owns the filter dialog session, the filter-dialog error toast, and
 * the filter-section leave-guard registration. Renders the filter
 * dialog host plus (depending on `intent`) the desktop sidebar
 * section or the mobile filter sheet trigger + sheet.
 *
 * Lifecycle = dismissal. The shell mounts this scope only while the
 * filter surface is active (desktop tab `leftPanelTab === "filter"`,
 * mobile `mobileSection === "filter"`). Switching surfaces unmounts
 * the scope — the `useReducer` state inside `useFilterDialogSession`
 * dies, the leave-guard's `beforeunload` listener detaches, the
 * dialog host portal closes. No effect-based reset, no flash before
 * paint: the unmount happens inside React's commit phase, ahead of
 * the next browser frame.
 *
 * The `intent` prop is pragmatic — desktop and mobile are mutually
 * exclusive at runtime (each scope mount is reached via either the
 * desktop panel slot or the mobile gate, never both), so a single
 * state owner with two render variants keeps the hook call single.
 * A breakpoint flip (window resize across `md`) remounts the scope;
 * losing in-flight dialog state on viewport change is an accepted
 * non-realistic flow.
 */
import { useCallback, useState } from "react"

import { FilterSidebarSection } from "@/features/editor/components/filter-sidebar-section"
import { MobileEditButton } from "@/features/editor/components/mobile-edit-button"
import { MobileFilterSheet } from "@/features/editor/components/mobile-filter-sheet"
import type { OperationError } from "@/lib/api/operation-error"
import { useDedupingErrorToast } from "@/lib/editor/hooks/use-deduping-error-toast"
import type { FilterDialogSourceImage, FilterType } from "@/lib/editor/hooks/use-filter-dialog-session"
import { useFilterDialogSession } from "@/lib/editor/hooks/use-filter-dialog-session"
import { useMutationLeaveGuard } from "@/lib/editor/hooks/use-mutation-leave-guard"

import { EditorDialogHost } from "./editor-dialog-host"

type FilterListLock = {
  message: string
  toggleable: boolean
  busy?: boolean
  onUnlock?: () => void
} | null

export type FilterSurfaceScopeProps = {
  intent: "desktop" | "mobile"
  filterSourceImage: FilterDialogSourceImage | null
  onApplyFilter: (args: { filterType: FilterType; filterParams: Record<string, unknown> }) => Promise<void>
  isAddFilterDisabled: boolean
  workflowDismissError: () => void
  // Shared data for both sidebar and sheet — identical prop sets.
  filterStack: Array<{ id: string; filterType: string }>
  canvasMode: "image" | "filter"
  hiddenFilterIds: Record<string, boolean>
  activeDisplayFilterId: string | null
  isActiveDisplayFilterHidden: boolean
  isRemovingFilter: boolean
  isLoadingInitial?: boolean
  lock?: FilterListLock
  onSelectFilter: (id: string) => void
  onToggleHidden: (id: string) => void
  onRemoveFilter: (id: string) => void
}

export function FilterSurfaceScope(props: FilterSurfaceScopeProps) {
  const filterDialog = useFilterDialogSession(props.filterSourceImage)
  const [editOpen, setEditOpen] = useState(false)

  useMutationLeaveGuard({ active: filterDialog.activeFilterType !== null })

  const dialogError: OperationError | null = filterDialog.error
    ? { stage: "unknown", message: filterDialog.error }
    : null
  useDedupingErrorToast(dialogError)

  const openSelection = useCallback(() => {
    if (props.isAddFilterDisabled) return
    props.workflowDismissError()
    filterDialog.beginSelection()
  }, [filterDialog, props])

  const handleApplyFilter = useCallback(
    async (op: { filterType: FilterType; filterParams: Record<string, unknown> }) => {
      await props.onApplyFilter(op)
      setEditOpen(false)
    },
    [props],
  )

  return (
    <>
      <EditorDialogHost
        selectionOpen={filterDialog.selectionOpen}
        filterDialogSource={filterDialog.session}
        onCloseSelection={filterDialog.closeSelection}
        onApplyFilter={handleApplyFilter}
      />
      {props.intent === "desktop" ? (
        <FilterSidebarSection
          filterStack={props.filterStack}
          canvasMode={props.canvasMode}
          hiddenFilterIds={props.hiddenFilterIds}
          isAddFilterDisabled={props.isAddFilterDisabled}
          activeDisplayFilterId={props.activeDisplayFilterId}
          isActiveDisplayFilterHidden={props.isActiveDisplayFilterHidden}
          isRemovingFilter={props.isRemovingFilter}
          isLoadingInitial={props.isLoadingInitial}
          lock={props.lock}
          onSelectFilter={props.onSelectFilter}
          onToggleHidden={props.onToggleHidden}
          onRemoveFilter={props.onRemoveFilter}
          onOpenSelection={openSelection}
        />
      ) : (
        <>
          <MobileEditButton onClick={() => setEditOpen(true)} ariaLabel="Edit filter" />
          {editOpen ? (
            <MobileFilterSheet
              onClose={() => setEditOpen(false)}
              filterStack={props.filterStack}
              canvasMode={props.canvasMode}
              hiddenFilterIds={props.hiddenFilterIds}
              isAddFilterDisabled={props.isAddFilterDisabled}
              activeDisplayFilterId={props.activeDisplayFilterId}
              isActiveDisplayFilterHidden={props.isActiveDisplayFilterHidden}
              isRemovingFilter={props.isRemovingFilter}
              isLoadingInitial={props.isLoadingInitial}
              lock={props.lock}
              onSelectFilter={props.onSelectFilter}
              onToggleHidden={props.onToggleHidden}
              onRemoveFilter={props.onRemoveFilter}
              onOpenSelection={openSelection}
            />
          ) : null}
        </>
      )}
    </>
  )
}
