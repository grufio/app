"use client"

import { useMemo } from "react"

import { computeImagePanelReady, computeWorkspaceReady } from "@/lib/editor/editor-ready"
import type { Unit } from "@/lib/editor/units"
import { mapSelectedNavIdToRightPanelSection } from "@/services/editor/panel-routing"

export function useRightPanelModel(args: {
  selectedNavId: string
  imageStateLoading: boolean
  imagePxU: { w: bigint; h: bigint } | null
  initialImagePxU: { w: bigint; h: bigint } | null
  workspaceLoading: boolean
  workspaceUnit: Unit | null
  masterImage: { signedUrl?: string | null; name?: string | null } | null
  projectImages: Array<{ id: string; name?: string | null }>
  selectedImageId: string | null
  lockedImageById: Record<string, boolean>
}) {
  const {
    selectedNavId,
    imageStateLoading,
    imagePxU,
    initialImagePxU,
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

  const panelImagePxU = useMemo(() => {
    if (imageStateLoading) return null
    return imagePxU ?? initialImagePxU ?? null
  }, [imagePxU, imageStateLoading, initialImagePxU])

  const workspaceReady = computeWorkspaceReady({
    workspaceLoading,
    workspaceUnit,
  })

  const imagePanelReady = computeImagePanelReady({
    workspaceReady,
    masterImage,
    imageStateLoading,
    panelImagePxU,
  })

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
    workspaceReady,
    imagePanelReady,
    activeRightSection,
    panelImageMeta,
  }
}
