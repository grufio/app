"use client"

/**
 * Mobile full-screen Trace sheet.
 *
 * Hosts the active-trace row + add / clear actions (same content as
 * the desktop left-panel `TraceSidebarSection`). Opens via the Trace
 * icon in the editor's bottom-nav.
 *
 * Layer-visibility toggles (Trace / Preview / Numbers) live in the
 * `MobileTopRightBar`'s Eye menu on the editor canvas, not in this
 * sheet — that's a one-tap action surface for a frequently-toggled
 * control, instead of a sheet open + scroll.
 *
 * `TraceSidebarSection` uses `SidebarMenuButton` which expects a
 * `SidebarProvider` ancestor (`useSidebar()` throws otherwise). The
 * sheet body is wrapped in `SidebarFrame` (= `SidebarProvider`) so
 * the section finds its context.
 *
 * Render shape mirrors `MobileFilterSheet` exactly: fullscreen
 * overlay on mobile, bounded floating card on `md+` (`desktop`).
 * `TraceSelectionController` + the per-kind configure dialogs are
 * Radix-portaled and already mobile-fullscreen (see #347 pattern),
 * so they surface cleanly over the sheet without changes here.
 */
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SidebarFrame } from "@/components/navigation/SidebarFrame"
import { SidebarContent } from "@/components/ui/sidebar"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

import { mobileSheetRootClass } from "./mobile-sheet-shell"
import { TraceSidebarSection } from "./trace-sidebar-section"

export function MobileTraceSheet(props: {
  onClose: () => void
  /** Desktop variant — bounded floating card instead of fullscreen. */
  desktop?: boolean
  trace: { kind: RegisteredTraceId } | null
  isAddTraceDisabled: boolean
  isClearingTrace: boolean
  isLoadingInitial?: boolean
  onClearTrace: () => void
  onOpenSelection: () => void
}) {
  const {
    onClose,
    desktop,
    trace,
    isAddTraceDisabled,
    isClearingTrace,
    isLoadingInitial,
    onClearTrace,
    onOpenSelection,
  } = props

  return (
    <section aria-label="Trace" className={mobileSheetRootClass(desktop)}>
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
