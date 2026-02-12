/**
 * Project thumbnail renderer (dashboard).
 *
 * Responsibilities:
 * - Render a lightweight preview of the project's master image.
 * - Avoid pulling Konva into non-editor bundles.
 */

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
  thumbUrl,
  artboardWidthPx,
  artboardHeightPx,
  initialImageTransform,
}: {
  thumbUrl?: string
  artboardWidthPx?: number
  artboardHeightPx?: number
  initialImageTransform: ProjectThumbImageState
}) {
  // `initialImageTransform` is currently not applied. Keeping it allows future “match editor view”
  // rendering without re-plumbing dashboard data.
  void initialImageTransform
  void artboardWidthPx
  void artboardHeightPx

  return (
    <div className="absolute inset-0">
      {thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbUrl} alt="" className="h-full w-full object-contain" />
      ) : null}
    </div>
  )
}

