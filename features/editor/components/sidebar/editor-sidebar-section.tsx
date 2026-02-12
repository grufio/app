"use client"

import type * as React from "react"

/**
 * Shared wrapper for right-sidebar sections (Page / Artboard / Image).
 *
 * IMPORTANT: This must preserve the exact DOM structure used in the right panel:
 * - outer: border-b px-4 py-3
 * - title: either a fixed-height title row, or a justify-between row with actions
 * - body: mt-3 wrapper
 */
export function EditorSidebarSection({
  title,
  testId,
  headerActions,
  children,
}: {
  title: string
  testId?: string
  headerActions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="border-b px-4 py-3" data-testid={testId}>
      {headerActions ? (
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-sidebar-foreground/70">{title}</div>
          <div className="flex items-center gap-1">{headerActions}</div>
        </div>
      ) : (
        <div className="flex h-6 items-center text-xs font-medium text-sidebar-foreground/70">{title}</div>
      )}
      <div className="mt-3">{children}</div>
    </div>
  )
}

