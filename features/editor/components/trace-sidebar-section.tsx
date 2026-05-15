"use client"

/**
 * Trace surface sidebar section (F21 PR2).
 *
 * Mirrors `FilterSidebarSection` but for the mutually-exclusive
 * Trace artefact: at most one row visible (the active trace), an
 * "Apply trace" CTA when none is set. No reorder, no chain — Trace
 * replaces, doesn't stack.
 */
import { Plus, ScanLine, Trash2 } from "lucide-react"

import { SidebarMenu, SidebarMenuAction, SidebarMenuActions, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { TRACE_REGISTRY, type RegisteredTraceId } from "@/lib/editor/trace/registry"
import { EditorSidebarSection } from "@/features/editor/components/sidebar/editor-sidebar-section"

function traceLabel(kind: string): string {
  return (TRACE_REGISTRY as Record<string, { label: string } | undefined>)[kind]?.label ?? "Trace"
}

export function TraceSidebarSection(props: {
  trace: { kind: RegisteredTraceId } | null
  isAddTraceDisabled: boolean
  isClearingTrace: boolean
  /** True while the trace state is being fetched for the first time. */
  isLoadingInitial?: boolean
  onClearTrace: () => void
  onOpenSelection: () => void
}) {
  const {
    trace,
    isAddTraceDisabled,
    isClearingTrace,
    isLoadingInitial,
    onClearTrace,
    onOpenSelection,
  } = props

  // First-load skeleton — keep parity with FilterSidebarSection's
  // visual rhythm (one placeholder row instead of two; Trace is
  // single-active so two would mislead).
  if (isLoadingInitial && !trace) {
    return (
      <EditorSidebarSection title="Trace">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Skeleton className="size-4" />
              <Skeleton className="h-3 w-20" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </EditorSidebarSection>
    )
  }

  return (
    <EditorSidebarSection title="Trace">
      <SidebarMenu>
        {trace ? (
          <SidebarMenuItem>
            <SidebarMenuButton isActive className="text-xs font-medium">
              <ScanLine />
              <span>{traceLabel(trace.kind)}</span>
            </SidebarMenuButton>
            <SidebarMenuActions>
              <SidebarMenuAction
                inline
                aria-label="Remove trace"
                disabled={isClearingTrace}
                onClick={onClearTrace}
              >
                <Trash2 />
              </SidebarMenuAction>
            </SidebarMenuActions>
          </SidebarMenuItem>
        ) : (
          <SidebarMenuItem>
            <SidebarMenuButton className="text-xs font-medium" disabled>
              <ScanLine />
              <span>New Trace</span>
            </SidebarMenuButton>
            <SidebarMenuAction aria-label="Add trace" disabled={isAddTraceDisabled} onClick={onOpenSelection}>
              <Plus />
            </SidebarMenuAction>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </EditorSidebarSection>
  )
}
