"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { WorkspaceRow } from "@/lib/editor/project-workspace"
import { clampOpacityPercent, normalizeWorkspacePageBg } from "@/services/editor/page-background"

export function usePageBackgroundState(args: {
  workspaceRow: WorkspaceRow | null
  updateWorkspacePageBg: (values: { enabled: boolean; color: string; opacity: number }) => Promise<void> | void
}) {
  const { workspaceRow, updateWorkspacePageBg } = args
  const normalized = normalizeWorkspacePageBg(workspaceRow)
  const [draft, setDraft] = useState<{
    projectId: string | null
    enabled: boolean
    color: string
    opacity: number
  } | null>(null)
  const activeProjectId = workspaceRow?.project_id ?? null
  const effective = draft && draft.projectId === activeProjectId ? draft : { projectId: activeProjectId, ...normalized }

  const pageBgRef = useRef<{ enabled: boolean; color: string; opacity: number }>({
    enabled: effective.enabled,
    color: effective.color,
    opacity: effective.opacity,
  })
  useEffect(() => {
    pageBgRef.current = { enabled: effective.enabled, color: effective.color, opacity: effective.opacity }
  }, [effective.color, effective.enabled, effective.opacity])

  const workspaceRowRef = useRef<WorkspaceRow | null>(workspaceRow)
  useEffect(() => {
    workspaceRowRef.current = workspaceRow
  }, [workspaceRow])

  const bgSaveTimerRef = useRef<number | null>(null)
  const scheduleSavePageBg = useCallback(
    (next: { enabled: boolean; color: string; opacity: number }) => {
      if (bgSaveTimerRef.current != null) window.clearTimeout(bgSaveTimerRef.current)
      bgSaveTimerRef.current = window.setTimeout(() => {
        bgSaveTimerRef.current = null
        const base = workspaceRowRef.current
        if (!base) return
        void updateWorkspacePageBg({
          enabled: next.enabled,
          color: next.color,
          opacity: next.opacity,
        })
      }, 250)
    },
    [updateWorkspacePageBg]
  )

  const handlePageBgEnabledChange = useCallback(
    (enabled: boolean) => {
      const { color, opacity } = pageBgRef.current
      setDraft({ projectId: activeProjectId, enabled, color, opacity })
      scheduleSavePageBg({ enabled, color, opacity })
    },
    [activeProjectId, scheduleSavePageBg]
  )

  const handlePageBgColorChange = useCallback(
    (color: string) => {
      const enabled = true
      const { opacity } = pageBgRef.current
      setDraft({ projectId: activeProjectId, enabled, color, opacity })
      scheduleSavePageBg({ enabled, color, opacity })
    },
    [activeProjectId, scheduleSavePageBg]
  )

  const handlePageBgOpacityChange = useCallback(
    (opacityPercent: number) => {
      const enabled = true
      const clamped = clampOpacityPercent(opacityPercent, 0)
      const { color } = pageBgRef.current
      setDraft({ projectId: activeProjectId, enabled, color, opacity: clamped })
      scheduleSavePageBg({ enabled, color, opacity: clamped })
    },
    [activeProjectId, scheduleSavePageBg]
  )

  useEffect(() => {
    return () => {
      if (bgSaveTimerRef.current != null) window.clearTimeout(bgSaveTimerRef.current)
    }
  }, [])

  return {
    pageBgEnabled: effective.enabled,
    pageBgColor: effective.color,
    pageBgOpacity: effective.opacity,
    handlePageBgEnabledChange,
    handlePageBgColorChange,
    handlePageBgOpacityChange,
  }
}
