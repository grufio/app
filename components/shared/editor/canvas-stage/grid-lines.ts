/**
 * Grid line geometry (pure).
 *
 * Responsibilities:
 * - Compute artboard grid line points for rendering (performance-safe).
 */
export type GridSpec = {
  spacingXPx: number
  spacingYPx: number
  lineWidthPx: number
  color: string
}

export type GridLine = { key: string; points: number[] }

export type GridLines = { stroke: string; strokeWidth: number; lines: GridLine[] }

/**
 * Compute artboard grid line geometry (pure).
 * Mirrors the logic previously embedded in `project-canvas-stage.tsx`.
 */
export function computeGridLines(opts: {
  artW: number
  artH: number
  grid: GridSpec
  maxLines: number
}): GridLines | null {
  const { artW, artH, grid, maxLines } = opts
  if (!Number.isFinite(grid.spacingXPx) || !Number.isFinite(grid.spacingYPx)) return null
  if (!Number.isFinite(grid.lineWidthPx) || grid.lineWidthPx <= 0) return null
  if (grid.spacingXPx <= 0 || grid.spacingYPx <= 0) return null
  if (artW <= 0 || artH <= 0) return null

  const nx = Math.floor(artW / grid.spacingXPx)
  const ny = Math.floor(artH / grid.spacingYPx)
  const total = Math.max(0, nx) + Math.max(0, ny)
  if (!Number.isFinite(total) || total <= 0) return null

  // If there are too many lines, skip some to stay performant.
  const stride = total > maxLines ? Math.ceil(total / maxLines) : 1

  const stroke = grid.color
  const strokeWidth = grid.lineWidthPx
  const lines: Array<GridLine> = []

  for (let i = 0; i <= nx; i += stride) {
    const x = i * grid.spacingXPx
    if (x < 0 || x > artW) continue
    lines.push({ key: `vx:${i}`, points: [x, 0, x, artH] })
  }
  for (let j = 0; j <= ny; j += stride) {
    const y = j * grid.spacingYPx
    if (y < 0 || y > artH) continue
    lines.push({ key: `hy:${j}`, points: [0, y, artW, y] })
  }
  return { stroke, strokeWidth, lines }
}

