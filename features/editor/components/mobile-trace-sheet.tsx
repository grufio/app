"use client"

/**
 * Mobile full-screen Trace sheet.
 *
 * Hosts the active-trace row + add / clear actions (same content as
 * the desktop left-panel `TraceSidebarSection`). Opens via the Edit
 * (Pencil) icon in the top-right bar while the Trace section is
 * active.
 *
 * Layer-visibility toggles (Trace / Preview / Numbers) live in the
 * Eye-button of the top-right bar, not in this sheet — that's a one-
 * tap action surface for a frequently-toggled control, instead of a
 * sheet open + scroll.
 *
 * `TraceSidebarSection` uses `SidebarMenuButton` which expects a
 * `SidebarProvider` ancestor (`useSidebar()` throws otherwise). The
 * sheet body is wrapped in `SidebarFrame` (= `SidebarProvider`) so
 * the section finds its context.
 *
 * Render shape mirrors `MobileFilterSheet` exactly: `absolute inset-0`
 * overlay inside the editor layout container, header + scrollable
 * body; the top-left/top-right bars stay visible via their `z-40`
 * which paints over this sheet's `z-30`. `TraceSelectionController`
 * + the per-kind configure dialogs are Radix-portaled and already
 * mobile-fullscreen (see #347 pattern), so they surface cleanly over
 * the sheet without changes here.
 */
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SidebarFrame } from "@/components/navigation/SidebarFrame"
import { SidebarContent } from "@/components/ui/sidebar"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

import { TraceSidebarSection } from "./trace-sidebar-section"

export function MobileTraceSheet(props: {
  onClose: () => void
  trace: { kind: RegisteredTraceId } | null
  isAddTraceDisabled: boolean
  isClearingTrace: boolean
  isLoadingInitial?: boolean
  onClearTrace: () => void
  onOpenSelection: () => void
}) {
  const {
    onClose,
    trace,
    isAddTraceDisabled,
    isClearingTrace,
    isLoadingInitial,
    onClearTrace,
    onOpenSelection,
  } = props

  return (
    <section
      aria-label="Trace"
      className="absolute inset-0 z-30 flex flex-col overflow-hidden bg-background md:hidden"
    >
      <header className="flex shrink-0 items-center justify-between border-b bg-background px-4 py-3">
        <h2 className="text-sm font-semibold">Trace</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close"
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-5" />
        </Button>
      </header>

      <SidebarFrame className="block min-h-0 flex-1">
        <SidebarContent className="gap-0">
          <TraceSidebarSection
            trace={trace}
            isAddTraceDisabled={isAddTraceDisabled}
            isClearingTrace={isClearingTrace}
            isLoadingInitial={isLoadingInitial}
            onClearTrace={onClearTrace}
            onOpenSelection={onOpenSelection}
          />
        </SidebarContent>
      </SidebarFrame>
    </section>
  )
}
