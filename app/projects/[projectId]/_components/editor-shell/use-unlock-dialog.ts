"use client"

/**
 * Shell-scope unlock-dialog state for image-section + filter-section
 * cascade-deletes.
 *
 * Owns:
 *   - `unlockRequest` (which scope is being unlocked + display copy)
 *   - `unlockBusy` (in-flight gate)
 *   - `unlockError` (last attempt's failure surface)
 *   - Derived banner copy for both sections
 *   - `requestImageUnlock` / `requestFilterUnlock` openers
 *   - `cancelUnlock`, `confirmUnlock` (the cascade itself)
 *
 * The confirm path snapshots `filterStack` + `hasTrace` at call-time
 * so a mid-flight refresh that mutates them underneath the user
 * doesn't change what gets deleted. Trace clears first (drops the
 * RESTRICT FK from project_image_trace.base_image_id → working_copy);
 * filters then unwind top-down so each `removeProjectImageFilter`
 * leaves `after = []` and skips the chain-rebuild path.
 */
import { useCallback, useMemo, useState } from "react"

import { removeProjectImageFilter } from "@/lib/api/project-images"
import type { SectionLocks } from "@/lib/editor/section-locks"

type UnlockRequest = {
  scope: "image" | "filter"
  title: string
  message: string
}

type FilterStackItem = { id: string }

export type UseUnlockDialogInput = {
  sectionLocks: SectionLocks
  hasFilter: boolean
  hasTrace: boolean
  filterStack: FilterStackItem[]
  handleClearTrace: () => Promise<unknown> | unknown
  projectId: string
  refreshFilterImage: () => Promise<unknown> | unknown
  refreshProjectImages: () => Promise<unknown> | unknown
}

export function useUnlockDialog(input: UseUnlockDialogInput) {
  const {
    sectionLocks,
    hasFilter,
    hasTrace,
    filterStack,
    handleClearTrace,
    projectId,
    refreshFilterImage,
    refreshProjectImages,
  } = input
  const [unlockRequest, setUnlockRequest] = useState<UnlockRequest | null>(null)
  const [unlockBusy, setUnlockBusy] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)

  const imageUnlockMessage = useMemo(() => {
    const parts: string[] = []
    if (hasFilter) {
      parts.push(`${filterStack.length} filter${filterStack.length === 1 ? "" : "s"}`)
    }
    if (hasTrace) parts.push("the trace overlay")
    return `Unlocking will permanently delete ${parts.join(" and ")}.`
  }, [hasFilter, hasTrace, filterStack.length])

  const filterUnlockMessage = "Unlocking will permanently delete the trace overlay."

  const imageLockBannerMessage = useMemo(() => {
    if (hasFilter && hasTrace) {
      return "Locked: filters and a trace depend on this image. Unlock removes them."
    }
    if (hasFilter) {
      return "Locked: a filter depends on this image. Unlock removes the filter."
    }
    if (hasTrace) {
      return "Locked: a trace depends on this image. Unlock removes the trace."
    }
    return ""
  }, [hasFilter, hasTrace])

  const filterLockBannerMessage = sectionLocks.filterToggleable
    ? "Locked: a trace depends on the filter chain. Unlock removes the trace."
    : "Locked: a trace exists. Remove it from the Trace section to edit filters."

  const requestImageUnlock = useCallback(() => {
    if (!sectionLocks.imageToggleable) return
    setUnlockError(null)
    setUnlockRequest({
      scope: "image",
      title: "Unlock image?",
      message: imageUnlockMessage,
    })
  }, [sectionLocks.imageToggleable, imageUnlockMessage])

  const requestFilterUnlock = useCallback(() => {
    if (!sectionLocks.filterToggleable) return
    setUnlockError(null)
    setUnlockRequest({
      scope: "filter",
      title: "Unlock filters?",
      message: filterUnlockMessage,
    })
  }, [sectionLocks.filterToggleable, filterUnlockMessage])

  const cancelUnlock = useCallback(() => {
    if (unlockBusy) return
    setUnlockRequest(null)
    setUnlockError(null)
  }, [unlockBusy])

  const confirmUnlock = useCallback(async () => {
    if (!unlockRequest || unlockBusy) return
    setUnlockBusy(true)
    setUnlockError(null)
    const scope = unlockRequest.scope
    const traceToDrop = hasTrace
    const filterIdsTopDown = scope === "image" ? [...filterStack].map((f) => f.id).reverse() : []
    try {
      if (traceToDrop) {
        await handleClearTrace()
      }
      for (const filterId of filterIdsTopDown) {
        await removeProjectImageFilter({ projectId, filterId })
      }
      if (filterIdsTopDown.length > 0) {
        await Promise.allSettled([refreshFilterImage(), refreshProjectImages()])
      }
      setUnlockRequest(null)
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Unlock failed")
    } finally {
      setUnlockBusy(false)
    }
  }, [
    unlockRequest,
    unlockBusy,
    hasTrace,
    filterStack,
    handleClearTrace,
    projectId,
    refreshFilterImage,
    refreshProjectImages,
  ])

  return {
    unlockRequest,
    unlockBusy,
    unlockError,
    imageLockBannerMessage,
    filterLockBannerMessage,
    requestImageUnlock,
    requestFilterUnlock,
    cancelUnlock,
    confirmUnlock,
  }
}
