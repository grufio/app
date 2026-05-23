"use client"

import { useMemo } from "react"

import { computeImagePanelReady, computeWorkspaceReady } from "@/lib/editor/editor-ready"
import type { Unit } from "@/lib/editor/units"
import { mapSelectedNavIdToRightPanelSection } from "@/services/editor/panel-routing"

export function useRightPanelModel(args: {
  selectedNavId: string
  /** The single authoritative display transform (Invariant 1). The panel
   * px readout reads this one source — no `imageTxU ?? initialImageTxU`
   * fallback chain (a second display surface of the old bug class). */
  displayTxU: { x: bigint; y: bigint; w: bigint; h: bigint } | null
  workspaceLoading: boolean
  workspaceUnit: Unit | null
  masterImage: { signedUrl?: string | null; name?: string | null } | null
  projectImages: Array<{ id: string; name?: string | null }>
  selectedImageId: string | null
}) {
  const {
    selectedNavId,
    displayTxU,
    workspaceLoading,
    workspaceUnit,
    masterImage,
    projectImages,
    selectedImageId,
  } = args

  const selectedImage = useMemo(() => {
    if (!selectedImageId) return null
    return projectImages.find((img) => img.id === selectedImageId) ?? null
  }, [projectImages, selectedImageId])

  const panelImageTxU = displayTxU

  const workspaceReady = computeWorkspaceReady({
    workspaceLoading,
    workspaceUnit,
  })

  const imagePanelReady = computeImagePanelReady({
    workspaceReady,
    masterImage,
    panelImagePxU: panelImageTxU ? { w: panelImageTxU.w, h: panelImageTxU.h } : null,
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
    panelImageTxU,
    workspaceReady,
    imagePanelReady,
    activeRightSection,
    panelImageMeta,
  }
}
