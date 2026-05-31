"use client"

/**
 * Mobile full-screen Trace sheet.
 *
 * Combines the desktop left-panel `TraceSidebarSection` (active trace
 * row + add / clear actions) with the right-panel
 * `TraceVisibilitySection` (Trace / Preview / Numbers layer toggles)
 * inside a single scrollable mobile screen. Opens via the Trace
 * icon in the editor's bottom-nav.
 *
 * `TraceSidebarSection` uses `SidebarMenuButton` which expects a
 * `SidebarProvider` ancestor (`useSidebar()` throws otherwise). The
 * sheet body is wrapped in `SidebarFrame` (= `SidebarProvider`) so
 * the section finds its context. `TraceVisibilitySection` doesn't
 * need the context but renders inside the same SidebarContent for
 * consistent vertical rhythm.
 *
 * Render shape mirrors `MobileFilterSheet` exactly: `absolute inset-0`
 * overlay inside the editor layout container, header + scrollable
 * body, bottom-nav stays as a flex-sibling beneath the layout.
 * `TraceSelectionController` + the per-kind configure dialogs are
 * Radix-portaled and already mobile-fullscreen (see #347 pattern),
 * so they surface cleanly over the sheet without changes here.
 */
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SidebarFrame } from "@/components/navigation/SidebarFrame"
import { SidebarContent } from "@/components/ui/sidebar"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

import { TraceSidebarSection } from "./trace-sidebar-section"
import { TraceVisibilitySection } from "./trace-visibility-section"

export function MobileTraceSheet(props: {
  onClose: () => void
  // TraceSidebarSection
  trace: { kind: RegisteredTraceId } | null
  isAddTraceDisabled: boolean
  isClearingTrace: boolean
  isLoadingInitial?: boolean
  onClearTrace: () => void
  onOpenSelection: () => void
  // TraceVisibilitySection
  traceOverlayVisible: boolean
  previewBitmapVisible: boolean
  numbersLayerVisible: boolean
  onTraceOverlayChange: (visible: boolean) => void
  onPreviewBitmapChange: (visible: boolean) => void
  onNumbersLayerChange: (visible: boolean) => void
}) {
  const {
    onClose,
    trace,
    isAddTraceDisabled,
    isClearingTrace,
    isLoadingInitial,
    onClearTrace,
    onOpenSelection,
    traceOverlayVisible,
    previewBitmapVisible,
    numbersLayerVisible,
    onTraceOverlayChange,
    onPreviewBitmapChange,
    onNumbersLayerChange,
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
          <TraceVisibilitySection
            traceOverlayVisible={traceOverlayVisible}
            previewBitmapVisible={previewBitmapVisible}
            numbersLayerVisible={numbersLayerVisible}
            onTraceOverlayChange={onTraceOverlayChange}
            onPreviewBitmapChange={onPreviewBitmapChange}
            onNumbersLayerChange={onNumbersLayerChange}
          />
        </SidebarContent>
      </SidebarFrame>
    </section>
  )
}
