"use client"

import { useMemo } from "react"

import { computeImagePanelReady, computeWorkspaceReady } from "@/lib/editor/editor-ready"
import type { Unit } from "@/lib/editor/units"
import { mapSelectedNavIdToRightPanelSection } from "@/services/editor/panel-routing"

export function useRightPanelModel(args: {
  selectedNavId: string
  imageStateLoading: boolean
  imageTransformPxU: { x: bigint; y: bigint; w: bigint; h: bigint } | null
  initialImageTransformPxU: { x: bigint; y: bigint; w: bigint; h: bigint } | null
  workspaceLoading: boolean
  workspaceUnit: Unit | null
  masterImage: { signedUrl?: string | null; name?: string | null; width_px?: number | null; height_px?: number | null } | null
  projectImages: Array<{ id: string; name?: string | null }>
  selectedImageId: string | null
  lockedImageById: Record<string, boolean>
}) {
  const {
    selectedNavId,
    imageStateLoading,
    imageTransformPxU,
    initialImageTransformPxU,
    workspaceLoading,
    workspaceUnit,
    masterImage,
    projectImages,
    selectedImageId,
    lockedImageById,
  } = args

  const selectedImage = useMemo(() => {
    if (!selectedImageId) return null
    return projectImages.find((img) => img.id === selectedImageId) ?? null
  }, [projectImages, selectedImageId])

  const imagePanelLocked = useMemo(
    () => (selectedImageId ? Boolean(lockedImageById[selectedImageId]) : false),
    [lockedImageById, selectedImageId]
  )

  const activeTransformPxU = useMemo(
    () => imageTransformPxU ?? initialImageTransformPxU ?? null,
    [imageTransformPxU, initialImageTransformPxU]
  )

  const panelImagePxU = useMemo(() => {
    if (!activeTransformPxU) return null
    return { w: activeTransformPxU.w, h: activeTransformPxU.h }
  }, [activeTransformPxU])

  const panelImagePosPxU = useMemo(() => {
    if (!activeTransformPxU) return null
    return { x: activeTransformPxU.x, y: activeTransformPxU.y }
  }, [activeTransformPxU])

  const workspaceReady = computeWorkspaceReady({
    workspaceLoading,
    workspaceUnit,
  })

  const imagePanelReady = computeImagePanelReady({
    workspaceReady,
    imageStateLoading,
    panelImagePxU,
  })

  const imagePanelState = useMemo<"loading" | "no_state" | "ready">(() => {
    if (!workspaceReady || imageStateLoading) return "loading"
    if (!imagePanelReady) return "no_state"
    return "ready"
  }, [workspaceReady, imageStateLoading, imagePanelReady])

  const activeRightSection = mapSelectedNavIdToRightPanelSection(selectedNavId)

  const panelImageMeta = useMemo(() => {
    if (!selectedImage) return masterImage
    return {
      signedUrl: masterImage?.signedUrl ?? null,
      name: selectedImage.name ?? "Image",
    }
  }, [masterImage, selectedImage])

  return {
    selectedImage,
    imagePanelLocked,
    panelImagePxU,
    panelImagePosPxU,
    workspaceReady,
    imagePanelReady,
    imagePanelState,
    activeRightSection,
    panelImageMeta,
  }
}
