"use client"

/**
 * Trace tools bar — the horizontal canvas toolbar (bottom centre) for the
 * Trace section. A deliberately reduced set vs. the Image `EditorToolsBar`:
 *
 *   hand   — pans the artboard view (Move Artboard).
 *   arrow  — outlined pointer. PLACEHOLDER: its behaviour is wired later, so it
 *            currently does nothing when clicked.
 *   zoom-  — artboard smaller (zoom out).
 *   zoom+  — artboard bigger (zoom in).
 *
 * No object/crop/fit/rotate here — the Trace section doesn't edit the image
 * geometry, it works on the trace overlay.
 */
import { Hand, MousePointer2, ZoomIn, ZoomOut } from "lucide-react"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { EditorTool } from "@/lib/editor/editor-tools-bar-controls"

import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { pillClass } from "./floating-bar-styles"
import { ToolbarIconButton } from "./toolbar-icon-button"

type Props = {
  /** Current stage tool — only "hand" highlights a button in this bar. */
  tool: EditorTool
  /** Selects the Hand (pan artboard) tool. */
  onHand: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  /** Disables the zoom actions (e.g. no source image yet). */
  actionsDisabled?: boolean
  /** Optional select-tool handler. Until this is provided the Arrow renders as
   * an inert placeholder (present in the bar, no behaviour yet). */
  onSelect?: () => void
  /** Whether the (future) select tool is the active tool. */
  selectActive?: boolean
  className?: string
}

function IconButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ToolbarIconButton label={label} active={active} disabled={disabled} onClick={onClick}>
          {children}
        </ToolbarIconButton>
      </TooltipTrigger>
      <TooltipContent side="top" align="center">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function EditorTraceToolsBar({
  tool,
  onHand,
  onZoomIn,
  onZoomOut,
  actionsDisabled = false,
  onSelect,
  selectActive = false,
  className,
}: Props) {
  const tone = useEditorToolbarTone()
  return (
    <TooltipProvider delayDuration={150}>
      <div
        role="toolbar"
        aria-label="Trace canvas toolbar"
        // `px-1` keeps the horizontal toolbar 40px tall — matching the nav pills.
        className={cn(pillClass(tone, "group"), "flex-row px-1", className)}
      >
        <IconButton label="Hand (Move Artboard)" active={tool === "hand"} onClick={onHand}>
          <Hand className="size-6" />
        </IconButton>
        <IconButton
          label="Select (coming soon)"
          active={selectActive}
          // Placeholder until `onSelect` is wired — a bare click is a no-op so
          // the menu reads as complete without triggering unfinished behaviour.
          onClick={onSelect ?? (() => {})}
        >
          <MousePointer2 className="size-6" />
        </IconButton>
        <IconButton label="Zoom out (artboard smaller)" onClick={onZoomOut} disabled={actionsDisabled}>
          <ZoomOut className="size-6" />
        </IconButton>
        <IconButton label="Zoom in (artboard bigger)" onClick={onZoomIn} disabled={actionsDisabled}>
          <ZoomIn className="size-6" />
        </IconButton>
      </div>
    </TooltipProvider>
  )
}
