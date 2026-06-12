"use client"

import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react"

import type { ProjectCanvasStageHandle } from "@/features/editor"
import { buildNavId, parseNavId } from "@/features/editor/navigation/nav-id"
import { useFloatingToolbarControls, type EditorTool } from "@/lib/editor/floating-toolbar-controls"

function useEditorInteractionController(args: {
  tool: EditorTool
  setTool: (tool: EditorTool) => void
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
      setTool("object")
      return
    }

    if (masterImageId) {
      setSelectedNavId(buildNavId({ kind: "image", imageId: masterImageId }))
      return
    }

    setTool("object")
  }, [cropBusy, masterImageId, selectedNavId, setSelectedNavId, setTool, tool])
}

export function useStageInteractionPolicy(args: {
  canvasRef: RefObject<ProjectCanvasStageHandle | null>
  /** The active editor section (the shell's `editorSection`) — drives
   * the per-section tool availability on both viewports. */
  activeSection: string
  sourceReady: boolean
  selectedNavId: string
  setSelectedNavId: (next: string) => void
  activeCanvasImageId: string | null
  isCropping: boolean
  onApplyCrop: (rect: { x: number; y: number; w: number; h: number }) => void
}) {
  const {
    canvasRef,
    activeSection,
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
    enableShortcuts: true,
  })

  // Per-section tool availability. Object is the default everywhere
  // (whole-image drag/resize). Direct only on the Trace section
  // (clicks trace-overlay regions). Crop only on the Artboard
  // section. Hand is always available — it pans the artboard view and
  // never touches the image or trace.
  const showDirectSelect = activeSection === "trace"
  const cropDisabled = activeSection !== "artboard"
  const rotateDisabled = activeSection === "filter"

  // If the current tool isn't valid on the active section, fall back to
  // object so the user always lands in an image-movable state.
  useEffect(() => {
    if (toolbar.tool === "direct" && !showDirectSelect) {
      toolbar.setTool("object")
      return
    }
    if (toolbar.tool === "crop" && cropDisabled) {
      toolbar.setTool("object")
    }
  }, [cropDisabled, showDirectSelect, toolbar])

  const handleToolbarToolChange = useCallback(
    (tool: EditorTool) => {
      if (tool === "direct" && !showDirectSelect) return
      if (tool === "crop" && cropDisabled) return
      toolbar.setTool(tool)
    },
    [cropDisabled, showDirectSelect, toolbar]
  )

  useEditorInteractionController({
    tool: toolbar.tool,
    setTool: handleToolbarToolChange,
    selectedNavId,
    setSelectedNavId,
    masterImageId: activeCanvasImageId,
    cropBusy: isCropping,
  })

  const applyCropSelection = useCallback(async () => {
    if (cropDisabled) return
    if (isCropping) return
    if (!sourceReady) return
    const selection = canvasRef.current?.getCropSelection()
    if (!selection?.ok) {
      console.warn("Crop apply blocked", { reason: selection?.reason ?? "not_ready" })
      return
    }
    onApplyCrop(selection.rect)
    toolbar.setTool("object")
  }, [canvasRef, cropDisabled, isCropping, onApplyCrop, sourceReady, toolbar])

  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      if (cropDisabled) return
      if (toolbar.tool !== "crop") return
      if (isCropping) return
      if (e.key === "Escape") {
        e.preventDefault()
        canvasRef.current?.resetCropSelection()
        toolbar.setTool("object")
        return
      }
      if (e.key !== "Enter") return
      e.preventDefault()
      await applyCropSelection()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [applyCropSelection, canvasRef, cropDisabled, isCropping, toolbar])

  const stageToolbar = useMemo(
    () => ({
      ...toolbar,
      setTool: handleToolbarToolChange,
      showDirectSelect,
      objectDisabled: false,
      directDisabled: !showDirectSelect,
      cropDisabled,
      rotateDisabled,
      cropEnabled: !cropDisabled && toolbar.tool === "crop",
      cropBusy: isCropping,
      imageDraggable: toolbar.tool === "object",
      panEnabled: toolbar.tool === "hand",
      directActive: toolbar.tool === "direct",
    }),
    [cropDisabled, handleToolbarToolChange, isCropping, rotateDisabled, showDirectSelect, toolbar]
  )

  return {
    toolbar,
    stageToolbar,
    applyCropSelection,
  }
}
