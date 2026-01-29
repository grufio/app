"use client"

/**
 * Project thumbnail renderer (dashboard).
 *
 * Responsibilities:
 * - Fetch the project's master image and render a lightweight canvas preview.
 * - Use persisted image transform to match the editor view.
 */
import { useEffect, useMemo, useState } from "react"

import { getMasterImage } from "@/lib/api/project-images"
import { ProjectCanvasStage } from "@/components/shared/editor/project-canvas-stage"

export type ProjectThumbImageState = {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotationDeg: number
  widthPx?: number
  heightPx?: number
} | null

export function ProjectCardThumbnail({
  projectId,
  artboardWidthPx,
  artboardHeightPx,
  initialImageTransform,
}: {
  projectId: string
  artboardWidthPx?: number
  artboardHeightPx?: number
  initialImageTransform: ProjectThumbImageState
}) {
  const [state, setState] = useState<{ projectId: string; src: string | null }>({ projectId, src: null })
  const src = state.projectId === projectId ? state.src : null

  useEffect(() => {
    let cancelled = false
    getMasterImage(projectId)
      .then((res) => {
        if (cancelled) return
        setState({ projectId, src: res.exists ? res.signedUrl : null })
      })
      .catch(() => {
        if (cancelled) return
        setState({ projectId, src: null })
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const hasArtboard = useMemo(
    () => Boolean((artboardWidthPx ?? 0) > 0 && (artboardHeightPx ?? 0) > 0),
    [artboardHeightPx, artboardWidthPx]
  )

  // Render a non-interactive stage that is clipped to the thumbnail viewport (4:3 container).
  // Fit padding is 0 so the artboard triggers full height/width like a thumbnail "contain".
  return (
    <div className="absolute inset-0">
      <ProjectCanvasStage
        src={src ?? undefined}
        className="pointer-events-none h-full w-full"
        panEnabled={false}
        imageDraggable={false}
        fitPaddingPx={0}
        renderArtboard={false}
        artboardWidthPx={hasArtboard ? artboardWidthPx : undefined}
        artboardHeightPx={hasArtboard ? artboardHeightPx : undefined}
        initialImageTransform={initialImageTransform}
      />
    </div>
  )
}

