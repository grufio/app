"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { WorkspaceRow } from "@/lib/editor/project-workspace"
import { pxUToUnitDisplayUiFixed, unitToPxUFixed } from "@/lib/editor/units"
import { normalizeWorkspacePadding } from "@/services/editor/padding"

type PaddingMm = { top: string; bottom: string; left: string; right: string }

/** Persisted µpx → mm display strings for the four padding fields. */
function paddingMmFromRow(row: WorkspaceRow | null): PaddingMm {
  const p = normalizeWorkspacePadding(row)
  return {
    top: pxUToUnitDisplayUiFixed(BigInt(p.topPxU), "mm"),
    bottom: pxUToUnitDisplayUiFixed(BigInt(p.bottomPxU), "mm"),
    left: pxUToUnitDisplayUiFixed(BigInt(p.leftPxU), "mm"),
    right: pxUToUnitDisplayUiFixed(BigInt(p.rightPxU), "mm"),
  }
}

/**
 * Draft + 250ms-debounced padding state (mm in the fields, µpx persisted).
 * Mirrors `use-page-background-state.ts`. The provider's `updateWorkspacePadding`
 * is a direct save — the debounce lives here.
 */
export function usePaddingState(args: {
  workspaceRow: WorkspaceRow | null
  updateWorkspacePadding: (values: {
    topPxU: string
    bottomPxU: string
    leftPxU: string
    rightPxU: string
  }) => Promise<unknown> | void
}) {
  const { workspaceRow, updateWorkspacePadding } = args
  const normalizedMm = paddingMmFromRow(workspaceRow)
  const activeProjectId = workspaceRow?.project_id ?? null

  const [draft, setDraft] = useState<({ projectId: string | null } & PaddingMm) | null>(null)
  const effective =
    draft && draft.projectId === activeProjectId ? draft : { projectId: activeProjectId, ...normalizedMm }

  const mmRef = useRef<PaddingMm>({
    top: effective.top,
    bottom: effective.bottom,
    left: effective.left,
    right: effective.right,
  })
  useEffect(() => {
    mmRef.current = { top: effective.top, bottom: effective.bottom, left: effective.left, right: effective.right }
  }, [effective.top, effective.bottom, effective.left, effective.right])

  const workspaceRowRef = useRef<WorkspaceRow | null>(workspaceRow)
  useEffect(() => {
    workspaceRowRef.current = workspaceRow
  }, [workspaceRow])

  const saveTimerRef = useRef<number | null>(null)
  const scheduleSave = useCallback(
    (next: PaddingMm) => {
      if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null
        if (!workspaceRowRef.current) return
        void updateWorkspacePadding({
          topPxU: unitToPxUFixed(next.top.trim() || "0", "mm").toString(),
          bottomPxU: unitToPxUFixed(next.bottom.trim() || "0", "mm").toString(),
          leftPxU: unitToPxUFixed(next.left.trim() || "0", "mm").toString(),
          rightPxU: unitToPxUFixed(next.right.trim() || "0", "mm").toString(),
        })
      }, 250)
    },
    [updateWorkspacePadding]
  )

  const handlePaddingTopChange = useCallback(
    (value: string) => {
      const next = { ...mmRef.current, top: value }
      setDraft({ projectId: activeProjectId, ...next })
      scheduleSave(next)
    },
    [activeProjectId, scheduleSave]
  )
  const handlePaddingBottomChange = useCallback(
    (value: string) => {
      const next = { ...mmRef.current, bottom: value }
      setDraft({ projectId: activeProjectId, ...next })
      scheduleSave(next)
    },
    [activeProjectId, scheduleSave]
  )
  const handlePaddingLeftChange = useCallback(
    (value: string) => {
      const next = { ...mmRef.current, left: value }
      setDraft({ projectId: activeProjectId, ...next })
      scheduleSave(next)
    },
    [activeProjectId, scheduleSave]
  )
  const handlePaddingRightChange = useCallback(
    (value: string) => {
      const next = { ...mmRef.current, right: value }
      setDraft({ projectId: activeProjectId, ...next })
      scheduleSave(next)
    },
    [activeProjectId, scheduleSave]
  )

  useEffect(() => {
    return () => {
      if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current)
    }
  }, [])

  return {
    paddingTop: effective.top,
    paddingBottom: effective.bottom,
    paddingLeft: effective.left,
    paddingRight: effective.right,
    handlePaddingTopChange,
    handlePaddingBottomChange,
    handlePaddingLeftChange,
    handlePaddingRightChange,
  }
}
