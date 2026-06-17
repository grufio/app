"use client"

/**
 * Editor Trace sheet (full-screen on mobile, bounded card on desktop).
 *
 * Hosts the active-trace row + add / clear actions (same content as
 * the desktop left-panel `TraceSidebarSection`). Opens via the Trace
 * icon in the editor's bottom-nav.
 *
 * Layer-visibility toggles (Trace / Preview / Numbers) live in the
 * `EditorTopRightBar`'s Eye menu on the editor canvas, not in this
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
import { SidebarFrame } from "@/components/navigation/SidebarFrame"
import { SidebarContent } from "@/components/ui/sidebar"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

import { sheetRootClass } from "./sheet-shell"
import { SheetHeader } from "./sheet-chrome"
import { TraceSidebarSection } from "./trace-sidebar-section"

export function TraceSheet(props: {
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
    <section aria-label="Trace" className={sheetRootClass()}>
      <SheetHeader title="Trace" onClose={onClose} />

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
