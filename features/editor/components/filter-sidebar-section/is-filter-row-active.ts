/**
 * Decides whether a filter sidebar row should render as "active"
 * (highlighted). The Filter tab paints one row at a time as the
 * canvas display target; outside the Filter tab and on hidden
 * filters the highlight goes away.
 *
 * Pure function so the rule can be unit-tested without rendering
 * the sidebar.
 */
export type FilterRowActiveSignals = {
  canvasMode: "image" | "filter"
  activeDisplayFilterId: string | null
  isActiveDisplayFilterHidden: boolean
  filterId: string
}

export function isFilterRowActive(signals: FilterRowActiveSignals): boolean {
  return (
    signals.canvasMode === "filter" &&
    !signals.isActiveDisplayFilterHidden &&
    signals.activeDisplayFilterId === signals.filterId
  )
}
