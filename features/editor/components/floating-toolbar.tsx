"use client"

/**
 * Floating toolbar overlay for the editor canvas.
 *
 * Responsibilities:
 * - Provide tool selection (select/hand) and view actions (zoom/fit/rotate).
 * - Stay visually lightweight and keyboard-friendly.
 */
import { Hand, Maximize2, MousePointer2, RotateCw, ZoomIn, ZoomOut } from "lucide-react"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { EditorTool } from "@/lib/editor/floating-toolbar-controls"
import { ToolbarIconButton } from "./toolbar-icon-button"

export type FloatingToolbarTool = EditorTool

const TOOLBAR_ICON_STROKE_WIDTH = 1

type Props = {
  leftSlot?: React.ReactNode
  tool: FloatingToolbarTool
  onToolChange: (tool: FloatingToolbarTool) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onRotate: () => void
  /** Disables non-tool actions (zoom/fit/rotate). */
  actionsDisabled?: boolean
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
        <ToolbarIconButton
          label={label}
          active={active}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </ToolbarIconButton>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function FloatingToolbar({
  leftSlot,
  tool,
  onToolChange,
  onZoomIn,
  onZoomOut,
  onFit,
  onRotate,
  actionsDisabled = false,
  className,
}: Props) {
  return (
    <TooltipProvider delayDuration={150}>
      <div
        role="toolbar"
        aria-label="Canvas toolbar"
        className={cn(
          "inline-flex items-center gap-3 rounded-lg border bg-background/90 px-2 py-1 shadow-sm backdrop-blur",
          className
        )}
      >
        {leftSlot}
        <IconButton label="Select (Move Image)" active={tool === "select"} onClick={() => onToolChange("select")}>
          <MousePointer2 className="size-6" strokeWidth={TOOLBAR_ICON_STROKE_WIDTH} />
        </IconButton>
        <IconButton label="Hand (Move Artboard)" active={tool === "hand"} onClick={() => onToolChange("hand")}>
          <Hand className="size-6" strokeWidth={TOOLBAR_ICON_STROKE_WIDTH} />
        </IconButton>

        <IconButton label="Zoom in" onClick={onZoomIn} disabled={actionsDisabled}>
          <ZoomIn className="size-6" strokeWidth={TOOLBAR_ICON_STROKE_WIDTH} />
        </IconButton>
        <IconButton label="Zoom out" onClick={onZoomOut} disabled={actionsDisabled}>
          <ZoomOut className="size-6" strokeWidth={TOOLBAR_ICON_STROKE_WIDTH} />
        </IconButton>
        <IconButton label="Fit to screen" onClick={onFit} disabled={actionsDisabled}>
          <Maximize2 className="size-6" strokeWidth={TOOLBAR_ICON_STROKE_WIDTH} />
        </IconButton>
        <IconButton label="Rotate 90°" onClick={onRotate} disabled={actionsDisabled}>
          <RotateCw className="size-6" strokeWidth={TOOLBAR_ICON_STROKE_WIDTH} />
        </IconButton>
      </div>
    </TooltipProvider>
  )
}

