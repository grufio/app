"use client"

/**
 * Floating toolbar overlay for the editor canvas.
 *
 * Tool roles (Illustrator-style):
 *   object — filled arrow. Whole-image drag/resize. Default on every tab.
 *   direct — outlined arrow. Trace-overlay region click/highlight.
 *            Only shown on the Trace tab.
 *   hand   — pans the artboard view.
 *   crop   — crops the image. Only on Image tab.
 */
import { Crop, Hand, Maximize2, MousePointer2, RotateCw, ZoomIn, ZoomOut } from "lucide-react"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { EditorTool } from "@/lib/editor/floating-toolbar-controls"
import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { pillClass } from "./floating-bar-styles"
import { ToolbarIconButton } from "./toolbar-icon-button"

export type FloatingToolbarTool = EditorTool

type Props = {
  leftSlot?: React.ReactNode
  tool: FloatingToolbarTool
  onToolChange: (tool: FloatingToolbarTool) => void
  /** Whether to render the Direct-Selection (outlined arrow) button. */
  showDirectSelect?: boolean
  cropDisabled?: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onRotate: () => void
  /** Disables non-tool actions (zoom/fit/rotate). */
  actionsDisabled?: boolean
  /** Disables rotate action specifically. */
  rotateDisabled?: boolean
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
      <TooltipContent side="left" align="center">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function FloatingToolbar({
  leftSlot,
  tool,
  onToolChange,
  showDirectSelect = false,
  cropDisabled = false,
  onZoomIn,
  onZoomOut,
  onFit,
  onRotate,
  actionsDisabled = false,
  rotateDisabled = false,
  className,
}: Props) {
  const tone = useEditorToolbarTone()
  return (
    <TooltipProvider delayDuration={150}>
      <div
        role="toolbar"
        aria-label="Canvas toolbar"
        // `px-1` (not the group default `px-2`) keeps the vertical toolbar
        // 40px wide — matching the nav pills — instead of 48px.
        className={cn(pillClass(tone, "group"), "flex-col px-1", className)}
      >
        {leftSlot}
        <IconButton
          label="Object (Move Image)"
          active={tool === "object"}
          onClick={() => onToolChange("object")}
        >
          <MousePointer2 className="size-6" fill="currentColor" />
        </IconButton>
        {showDirectSelect ? (
          <IconButton
            label="Direct (Select Trace Region)"
            active={tool === "direct"}
            onClick={() => onToolChange("direct")}
          >
            <MousePointer2 className="size-6" />
          </IconButton>
        ) : null}
        <IconButton label="Hand (Move Artboard)" active={tool === "hand"} onClick={() => onToolChange("hand")}>
          <Hand className="size-6" />
        </IconButton>
        <IconButton label="Crop" active={tool === "crop"} disabled={cropDisabled} onClick={() => onToolChange("crop")}>
          <Crop className="size-6" />
        </IconButton>

        <IconButton label="Zoom in" onClick={onZoomIn} disabled={actionsDisabled}>
          <ZoomIn className="size-6" />
        </IconButton>
        <IconButton label="Zoom out" onClick={onZoomOut} disabled={actionsDisabled}>
          <ZoomOut className="size-6" />
        </IconButton>
        <IconButton label="Fit to screen" onClick={onFit} disabled={actionsDisabled}>
          <Maximize2 className="size-6" />
        </IconButton>
        <IconButton label="Rotate 90°" onClick={onRotate} disabled={actionsDisabled || rotateDisabled}>
          <RotateCw className="size-6" />
        </IconButton>
      </div>
    </TooltipProvider>
  )
}
