"use client"

/**
 * Two-checkbox layer-visibility control for the Trace tab — sits
 * beside the `TraceSidebarSection` in the left sidebar's trace
 * panel. The bitmap and SVG-overlay layers are independent in the
 * DOM (Konva.Image inside the stage vs. inline `<svg>` mounted
 * above it), so each checkbox flips one off without affecting the
 * other. Both default to true; the underlying state lives in
 * `useEditorSessionState` as session-ephemeral booleans.
 *
 * Layout: stateless and presentational. The checkbox + label row
 * mirrors the `inner_enabled` pattern from `circulate-form.tsx` —
 * same `flex items-center gap-2` shape, same Radix `Checkbox`
 * primitive — so the trace sidebar stays visually consistent with
 * the trace dialog form sections.
 */
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

import { EditorSidebarSection } from "@/features/editor/components/sidebar/editor-sidebar-section"

export function TraceVisibilitySection(props: {
  traceOverlayVisible: boolean
  previewBitmapVisible: boolean
  onTraceOverlayChange: (visible: boolean) => void
  onPreviewBitmapChange: (visible: boolean) => void
}) {
  const { traceOverlayVisible, previewBitmapVisible, onTraceOverlayChange, onPreviewBitmapChange } = props
  return (
    <EditorSidebarSection title="Visibility">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="visibility_trace"
            checked={traceOverlayVisible}
            onCheckedChange={(c) => onTraceOverlayChange(c === true)}
          />
          <Label htmlFor="visibility_trace" className="cursor-pointer text-sm font-normal">
            Trace
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="visibility_preview"
            checked={previewBitmapVisible}
            onCheckedChange={(c) => onPreviewBitmapChange(c === true)}
          />
          <Label htmlFor="visibility_preview" className="cursor-pointer text-sm font-normal">
            Preview
          </Label>
        </div>
      </div>
    </EditorSidebarSection>
  )
}
