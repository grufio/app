"use client"

import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react"

import type { ProjectCanvasStageHandle } from "@/features/editor"
import { buildNavId, parseNavId } from "@/features/editor/navigation/nav-id"
import { useFloatingToolbarControls } from "@/lib/editor/floating-toolbar-controls"

function useEditorInteractionController(args: {
  tool: "select" | "hand" | "crop"
  setTool: (tool: "select" | "hand" | "crop") => void
  selectedNavId: string
  setSelectedNavId: (next: string) => void
  masterImageId: string | null
  cropBusy: boolean
}) {
  const { tool, setTool, selectedNavId, setSelectedNavId, masterImageId, cropBusy } = args
  const prevToolRef = useRef(tool)
  const prevNavIdRef = useRef(selectedNavId)

  useEffect(() => {
    const prevTool = prevToolRef.current
    const prevNavId = prevNavIdRef.current
    const toolChanged = prevTool !== tool
    const navChanged = prevNavId !== selectedNavId
    prevToolRef.current = tool
    prevNavIdRef.current = selectedNavId

    if (tool !== "crop" || cropBusy) return

    const selection = parseNavId(selectedNavId)
    if (selection.kind === "image") return

    if (navChanged && !toolChanged) {
      setTool("select")
      return
    }

    if (masterImageId) {
      setSelectedNavId(buildNavId({ kind: "image", imageId: masterImageId }))
      return
    }

    setTool("select")
  }, [cropBusy, masterImageId, selectedNavId, setSelectedNavId, setTool, tool])
}

export function useStageInteractionPolicy(args: {
  canvasRef: RefObject<ProjectCanvasStageHandle | null>
  canvasMode: "image" | "filter"
  imageStateLoading: boolean
  sourceReady: boolean
  selectedNavId: string
  setSelectedNavId: (next: string) => void
  activeCanvasImageId: string | null
  isCropping: boolean
  onApplyCrop: (rect: { x: number; y: number; w: number; h: number }) => void
}) {
  const {
    canvasRef,
    canvasMode,
    imageStateLoading,
    sourceReady,
    selectedNavId,
    setSelectedNavId,
    activeCanvasImageId,
    isCropping,
    onApplyCrop,
  } = args

  const toolbar = useFloatingToolbarControls({
    canvasRef,
    hasImage: sourceReady,
    masterImageLoading: !sourceReady,
    imageStateLoading,
    enableShortcuts: canvasMode !== "filter",
  })

  const handleToolbarToolChange = useCallback(
    (tool: typeof toolbar.tool) => {
      if (canvasMode === "filter" && (tool === "select" || tool === "crop")) {
        toolbar.setTool("hand")
        return
      }
      toolbar.setTool(tool)
    },
    [canvasMode, toolbar]
  )

  useEffect(() => {
    if (canvasMode !== "filter") return
    if (toolbar.tool !== "hand") toolbar.setTool("hand")
  }, [canvasMode, toolbar])

  useEditorInteractionController({
    tool: toolbar.tool,
    setTool: handleToolbarToolChange,
    selectedNavId,
    setSelectedNavId,
    masterImageId: activeCanvasImageId,
    cropBusy: isCropping,
  })

  const applyCropSelection = useCallback(async () => {
    if (canvasMode === "filter") return
    if (isCropping) return
    if (!sourceReady) return
    const selection = canvasRef.current?.getCropSelection()
    if (!selection?.ok) {
      console.warn("Crop apply blocked", { reason: selection?.reason ?? "not_ready" })
      return
    }
    onApplyCrop(selection.rect)
    toolbar.setTool("select")
  }, [canvasMode, canvasRef, isCropping, onApplyCrop, sourceReady, toolbar])

  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      if (canvasMode === "filter") return
      if (toolbar.tool !== "crop") return
      if (isCropping) return
      if (e.key === "Escape") {
        e.preventDefault()
        canvasRef.current?.resetCropSelection()
        toolbar.setTool("select")
        return
      }
      if (e.key !== "Enter") return
      e.preventDefault()
      await applyCropSelection()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [applyCropSelection, canvasMode, canvasRef, isCropping, toolbar])

  const stageToolbar = useMemo(
    () => ({
      ...toolbar,
      setTool: handleToolbarToolChange,
      selectDisabled: canvasMode === "filter",
      cropDisabled: canvasMode === "filter",
      rotateDisabled: canvasMode === "filter",
      cropEnabled: canvasMode !== "filter" && toolbar.tool === "crop",
      cropBusy: isCropping,
      imageDraggable: canvasMode !== "filter" && toolbar.tool === "select",
      panEnabled: canvasMode === "filter" ? true : toolbar.tool === "hand",
    }),
    [canvasMode, handleToolbarToolChange, isCropping, toolbar]
  )

  return {
    toolbar,
    stageToolbar,
    applyCropSelection,
  }
}
