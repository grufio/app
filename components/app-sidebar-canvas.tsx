"use client"

import { Hand, Maximize2, MousePointer2, RotateCw, ZoomIn, ZoomOut } from "lucide-react"

import { Button } from "@/components/ui/button"

type Props = {
  tool: "select" | "hand"
  onSelectTool: (tool: "select" | "hand") => void
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
      title={label}
    >
      {children}
    </Button>
  )
}

export function ProjectToolSidebar({
  tool,
  onSelectTool,
  onZoomIn,
  onZoomOut,
  onFit,
  onRotate,
}: Props) {
  return (
    <div className="flex flex-col gap-1">
      <ToolButton
        label="Select (Move Image)"
        active={tool === "select"}
        onClick={() => onSelectTool("select")}
      >
        <MousePointer2 className="size-4" />
      </ToolButton>
      <ToolButton
        label="Hand (Move Artboard)"
        active={tool === "hand"}
        onClick={() => onSelectTool("hand")}
      >
        <Hand className="size-4" />
      </ToolButton>
      <ToolButton label="Zoom in" onClick={onZoomIn}>
        <ZoomIn className="size-4" />
      </ToolButton>
      <ToolButton label="Zoom out" onClick={onZoomOut}>
        <ZoomOut className="size-4" />
      </ToolButton>
      <ToolButton label="Fit to screen" onClick={onFit}>
        <Maximize2 className="size-4" />
      </ToolButton>
      <ToolButton label="Rotate 90°" onClick={onRotate}>
        <RotateCw className="size-4" />
      </ToolButton>
    </div>
  )
}

