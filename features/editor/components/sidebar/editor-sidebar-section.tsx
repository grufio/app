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
 * `locked` is the section-lock visual signal — when true, the wrapper
 * renders with a subtle muted tint (`bg-muted/40`) and drops its
 * bottom border. A negative top margin overlaps the preceding
 * section's `border-b` so the locked block sits in a frameless
 * neutral pool, not boxed by stacked 1px lines.
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
        locked && "border-b-0 -mt-px bg-muted/40",
      )}
      data-testid={testId}
    >
      {headerActions ? (
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-sidebar-foreground/70">
            {title}
          </div>
          <div className="flex items-center gap-1">{headerActions}</div>
        </div>
      ) : (
        <div className="flex h-6 items-center text-xs font-medium text-sidebar-foreground/70">
          {title}
        </div>
      )}
      <div className="mt-3">{children}</div>
    </div>
  )
}
