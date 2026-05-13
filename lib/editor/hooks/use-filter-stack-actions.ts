"use client"

/**
 * Server-aware actions on the filter stack.
 *
 * Owns three pieces that pre-Tier-B were inlined in the shell as a
 * useCallback + two useEffects — all collaborating to keep the
 * session-state hidden-set in sync with the server `is_hidden` column:
 *
 *   - `toggleHidden(filterId)`: optimistic session toggle, then the
 *     `setProjectImageFilterHidden` API write. On failure: revert the
 *     local toggle, fire a normalize→format→toast for the user, and
 *     report telemetry via `reportClientError`. Followed by a working-
 *     image refresh so the persisted value re-hydrates state.
 *
 *   - Prune effect: when the visible filter stack changes (filters
 *     added, removed, reordered), drop entries from the
 *     `hiddenFilterIds` session map that no longer correspond to a
 *     known filter id.
 *
 *   - Hydrate effect: after each `filterStack` refresh, re-apply
 *     the server's `is_hidden` column into the session map so a
 *     reload reflects the persisted truth (the user's optimistic
 *     toggle would otherwise stick even if the API later returned a
 *     different value).
 */
import { useCallback, useEffect } from "react"

import { setProjectImageFilterHidden } from "@/lib/api/project-images"
import { reportClientError } from "@/lib/monitoring/with-error-reporting"
import { showOperationErrorToast } from "./use-deduping-error-toast"

type FilterStackItem = { id: string; is_hidden: boolean }

export function useFilterStackActions(args: {
  filterStack: FilterStackItem[]
  projectId: string
  refreshFilterImage: () => Promise<void>
  /** Local session toggle from `useEditorSessionState`. Fires
   * immediately for optimistic UI; `toggleHidden` calls it twice on
   * failure to revert. */
  toggleHiddenFilter: (filterId: string) => void
  showFilter: (filterId: string) => void
  hideFilter: (filterId: string) => void
  pruneHiddenFilters: (knownIds: Set<string>) => void
}): { toggleHidden: (filterId: string) => Promise<void> } {
  const {
    filterStack,
    projectId,
    refreshFilterImage,
    toggleHiddenFilter,
    showFilter,
    hideFilter,
    pruneHiddenFilters,
  } = args

  const toggleHidden = useCallback(
    async (filterId: string) => {
      const current = filterStack.find((f) => f.id === filterId)
      if (!current) return
      const nextHidden = !current.is_hidden
      toggleHiddenFilter(filterId)
      try {
        await setProjectImageFilterHidden({ projectId, filterId, isHidden: nextHidden })
        await refreshFilterImage()
      } catch (e) {
        toggleHiddenFilter(filterId)
        showOperationErrorToast(e)
        reportClientError(e, {
          scope: "editor",
          code: "FILTER_HIDDEN_TOGGLE_FAILED",
          stage: "save",
          context: { projectId, filterId },
        })
      }
    },
    [filterStack, projectId, refreshFilterImage, toggleHiddenFilter]
  )

  useEffect(() => {
    pruneHiddenFilters(new Set(filterStack.map((item) => item.id)))
  }, [filterStack, pruneHiddenFilters])

  useEffect(() => {
    for (const item of filterStack) {
      if (item.is_hidden) hideFilter(item.id)
      else showFilter(item.id)
    }
  }, [filterStack, hideFilter, showFilter])

  return { toggleHidden }
}
