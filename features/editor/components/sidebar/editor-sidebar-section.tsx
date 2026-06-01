"use client"

import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Shared wrapper for right-sidebar sections (Page / Artboard / Image).
 *
 * IMPORTANT: This must preserve the exact DOM structure used in the right panel:
 * - outer: border-b px-4 py-3
 * - title: either a fixed-height title row, or a justify-between row with actions
 * - body: mt-3 wrapper
 *
 * `locked` is the section-lock visual signal — when true, the
 * wrapper renders with the amber palette (`bg-amber-50` + inset
 * `ring-amber-300` + amber title text). Matches the palette of the
 * legacy `SectionLockBanner` so the visual identity carries over
 * onto the whole surface instead of a stripe of warning.
 */
export function EditorSidebarSection({
  title,
  testId,
  headerActions,
  locked,
  children,
}: {
  title: string
  testId?: string
  headerActions?: React.ReactNode
  locked?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "border-b px-4 py-3",
        locked && "bg-amber-50 ring-1 ring-inset ring-amber-300",
      )}
      data-testid={testId}
    >
      {headerActions ? (
        <div className="flex items-center justify-between gap-2">
          <div
            className={cn(
              "text-xs font-medium",
              locked ? "text-amber-900" : "text-sidebar-foreground/70",
            )}
          >
            {title}
          </div>
          <div className="flex items-center gap-1">{headerActions}</div>
        </div>
      ) : (
        <div
          className={cn(
            "flex h-6 items-center text-xs font-medium",
            locked ? "text-amber-900" : "text-sidebar-foreground/70",
          )}
        >
          {title}
        </div>
      )}
      <div className="mt-3">{children}</div>
    </div>
  )
}
