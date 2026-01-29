/**
 * Editor service: page background rules (UI-agnostic).
 *
 * Responsibilities:
 * - Normalize persisted workspace page background values into safe UI state.
 * - Centralize clamping/default behavior (keep semantics stable).
 */
import type { WorkspaceRow } from "@/lib/editor/project-workspace"

export function clampOpacityPercent(value: unknown, fallback: number): number {
  const n = Number(value)
  const base = Number.isFinite(n) ? n : fallback
  return Math.max(0, Math.min(100, base))
}

export function normalizeWorkspacePageBg(workspaceRow: WorkspaceRow): {
  enabled: boolean
  color: string
  opacity: number
} {
  return {
    enabled: Boolean(workspaceRow.page_bg_enabled ?? false),
    color: typeof workspaceRow.page_bg_color === "string" ? workspaceRow.page_bg_color : "#ffffff",
    opacity: clampOpacityPercent(workspaceRow.page_bg_opacity ?? 50, 50),
  }
}

