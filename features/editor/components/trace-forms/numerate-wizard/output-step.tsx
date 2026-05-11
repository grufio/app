export function OutputStep(props: {
  imageWidth: number
  imageHeight: number
  workspaceWidthPx: number | null
  workspaceHeightPx: number | null
}) {
  const { imageWidth, imageHeight, workspaceWidthPx, workspaceHeightPx } = props
  if (workspaceWidthPx == null || workspaceHeightPx == null) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
        Artboard size is not set yet. Open the Artboard panel and configure
        width × height before applying the trace.
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="rounded-md border bg-muted/40 px-3 py-3 text-xs">
        <div>
          Artboard: <span className="font-medium text-foreground">{workspaceWidthPx} × {workspaceHeightPx} px</span>
        </div>
        <div className="mt-1">
          Image: {imageWidth} × {imageHeight} px
        </div>
        <div className="mt-2 text-muted-foreground">
          The trace is placed onto the artboard at the current image position.
          Change the artboard dimensions in the right-panel “Artboard” section.
        </div>
      </div>
    </div>
  )
}
