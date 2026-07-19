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
 */
export function EditorSidebarSection({
  title,
  testId,
  headerActions,
  children,
}: {
  title?: string
  testId?: string
  headerActions?: React.ReactNode
  children: React.ReactNode
}) {
  const hasHeader = Boolean(title) || Boolean(headerActions)
  return (
    <div className="border-b px-4 py-3" data-testid={testId}>
      {headerActions ? (
        <div className={cn("flex items-center gap-2", title ? "justify-between" : "justify-end")}>
          {title ? (
            <div className="text-xs font-medium text-sidebar-foreground/70">{title}</div>
          ) : null}
          <div className="flex items-center gap-1">{headerActions}</div>
        </div>
      ) : title ? (
        <div className="flex h-6 items-center text-xs font-medium text-sidebar-foreground/70">
          {title}
        </div>
      ) : null}
      <div className={cn(hasHeader && "mt-3")}>{children}</div>
    </div>
  )
}
