"use client"

type GridLines = {
  lines: Array<{ key: string; points: number[] }>
  stroke: string
  strokeWidth: number
}

export function computeSnappedGridLines(args: {
  gridLines: GridLines | null
  snapWorldToDeviceHalfPixel: (coord: number, axis: "x" | "y") => number
}): GridLines | null {
  const { gridLines, snapWorldToDeviceHalfPixel } = args
  if (!gridLines) return null
  return {
    ...gridLines,
    lines: gridLines.lines.map((line) => {
      const [x1, y1, x2, y2] = line.points
      if (x1 === x2) {
        const snappedX = snapWorldToDeviceHalfPixel(x1, "x")
        return { ...line, points: [snappedX, y1, snappedX, y2] }
      }
      if (y1 === y2) {
        const snappedY = snapWorldToDeviceHalfPixel(y1, "y")
        return { ...line, points: [x1, snappedY, x2, snappedY] }
      }
      return line
    }),
  }
}
