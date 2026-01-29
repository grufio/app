"use client"

/**
 * Legacy/simple tool sidebar for canvas interactions.
 *
 * Responsibilities:
 * - Provide tool selection and view actions (zoom/fit/rotate) for the canvas.
 * - Kept for compatibility; the primary UI is `FloatingToolbar`.
 */
import { Hand, Maximize2, MousePointer2, RotateCw, ZoomIn, ZoomOut } from "lucide-react"

import { Button } from "@/components/ui/button"

type Tool = "select" | "hand"

type Props = {
  tool: Tool
  onSelectTool: (tool: Tool) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onRotate: () => void
}

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon"
      onClick={onClick}
      aria-label={label}
      aria-pressed={Boolean(active)}
      title={label}
    >
      {children}
    </Button>
  )
}

/**
 * Illustrator-style tool rail for the canvas area.
 * - Hand: pans the viewport (moves the artboard view)
 * - Pointer: moves the image within the artboard world
 */
export function CanvasToolSidebar({ tool, onSelectTool, onZoomIn, onZoomOut, onFit, onRotate }: Props) {
  return (
    <div className="flex flex-col gap-1" role="toolbar" aria-label="Canvas tools">
      <ToolButton label="Select (Move Image)" active={tool === "select"} onClick={() => onSelectTool("select")}>
        <MousePointer2 className="h-[16px] w-[16px]" />
      </ToolButton>
      <ToolButton label="Hand (Move Artboard)" active={tool === "hand"} onClick={() => onSelectTool("hand")}>
        <Hand className="h-[16px] w-[16px]" />
      </ToolButton>
      <ToolButton label="Zoom in" onClick={onZoomIn}>
        <ZoomIn className="h-[16px] w-[16px]" />
      </ToolButton>
      <ToolButton label="Zoom out" onClick={onZoomOut}>
        <ZoomOut className="h-[16px] w-[16px]" />
      </ToolButton>
      <ToolButton label="Fit to screen" onClick={onFit}>
        <Maximize2 className="h-[16px] w-[16px]" />
      </ToolButton>
      <ToolButton label="Rotate 90°" onClick={onRotate}>
        <RotateCw className="h-[16px] w-[16px]" />
      </ToolButton>
    </div>
  )
}

