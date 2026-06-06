/**
 * Client-side render helper for the Pixelate preview dialog.
 *
 * The output canvas is sized at the **source crop resolution**
 * (crop.w × crop.h source pixels), NOT at cellsX × cellsY. Each cell
 * is then painted as a solid-colour `fillRect` over its source-pixel
 * area. Effect: the displayed bitmap has full source resolution, the
 * browser doesn't have to upscale a tiny 16 × 11 bitmap to fit the
 * pane (which on some browsers/zoom-levels produced fuzzy edges
 * despite `image-rendering: pixelated`).
 *
 * Per-cell colours are computed as a **true area-average** over every
 * source pixel that falls into the cell — `cellAreaAverages` (now in the
 * shared `trace-cell-colors.ts`) — mirroring the server's `Image.BOX`
 * downsample (`filter-service/app/cell_colors.py`). The previous
 * implementation did a single `drawImage(source → cellsX×cellsY)`, which
 * for large reduction ratios samples only a tiny neighbourhood per cell
 * instead of averaging the whole block; that produced the noisy, "too low
 * resolution" cell colours and diverged from the actual trace output.
 *
 * Each cell mean is then snapped to the nearest Munsell palette chip via
 * OKLab (`mapCellsToPalette`), mirroring the server's `map_cells_to_palette`.
 * The palette comes from the DB (single source) over `/api/palette`; while it
 * loads the preview falls back to the raw area-average means.
 *
 * Caller (React) owns `target.width` / `target.height` via JSX props
 * set to `crop.w` / `crop.h`.
 */
import { applyNeighborInvasion } from "./cell-texture"
import type { DitherMode, DitherPatternSize } from "./dither-mode-schema"
import type { BlueNoiseLut } from "./knoll-yliluoma"
import { reduceToTopN } from "./palette-reduction"
import {
  cellAreaAverages,
  mapCellsDithered,
  type PaletteChip,
} from "./trace-cell-colors"

export function buildMiniCanvas(args: {
  target: HTMLCanvasElement
  source: CanvasImageSource
  crop: { x: number; y: number; w: number; h: number }
  cellsX: number
  cellsY: number
  /** Munsell palette to snap cells to (mirrors the server). Empty while it
   * loads → raw area-average means as a graceful fallback. */
  palette: ReadonlyArray<PaletteChip>
  /** Pre-snap OKLCh chroma multiplier (mirrors the server's
   * `pre_snap_chroma_scale`). Default `1.0` = no boost. */
  preSnapChromaScale?: number
  /** Cap on distinct chip count in the rendered preview (mirrors the server's
   * `num_colors` top-N reduction). When set, applied AFTER snap + texture so
   * the preview matches the Python output. */
  numColors?: number | null
  /** Blue-noise neighbour-invasion texture (mirrors the server's
   * `cell_texture.py`). Skipped when `textureEnabled` is false, `strength`
   * is 0, the LUT is still loading (`textureLut === null`), or no palette
   * is available — any of those degenerate to the snapped output. */
  textureEnabled?: boolean
  textureStrength?: number
  textureLut?: Uint8Array | null
  /** Dithering at the snap step (PR-F). `"none"` (default) preserves
   * byte-identical pre-feature preview output. When non-"none", the
   * texture step is no-op'd — KY/FS replace it functionally. */
  ditherMode?: DitherMode
  ditherPatternSize?: DitherPatternSize | number
}): void {
  const {
    target,
    source,
    crop,
    cellsX,
    cellsY,
    palette,
    preSnapChromaScale,
    numColors,
    textureEnabled,
    textureStrength,
    textureLut,
    ditherMode,
    ditherPatternSize,
  } = args
  const ctx = target.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("buildMiniCanvas: 2D context unavailable")

  // (1) Copy the cropped source region into a work canvas at FULL crop
  // resolution (no smoothing — a 1:1 blit), then read it back so every
  // source pixel feeds the per-cell average. No reduction happens in
  // drawImage, so the browser can't throw away detail here.
  const cropW = Math.max(1, Math.round(crop.w))
  const cropH = Math.max(1, Math.round(crop.h))
  const work = document.createElement("canvas")
  work.width = cropW
  work.height = cropH
  const wctx = work.getContext("2d", { willReadFrequently: true })
  if (!wctx) throw new Error("buildMiniCanvas: work 2D context unavailable")
  wctx.imageSmoothingEnabled = false
  wctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, cropW, cropH)
  const cropData = wctx.getImageData(0, 0, cropW, cropH).data

  // (2) True area-average per cell (mirrors server Image.BOX), then snap or
  // dither to the palette via OKLab — `mapCellsDithered` mirrors the
  // server's `map_cells_dithered`. `dither_mode="none"` (default) falls
  // through to plain `mapCellsToPalette`, byte-identical to the pre-PR-F
  // preview. An empty palette (still loading) returns the raw means
  // unchanged as a graceful fallback. `preSnapChromaScale` (default 1.0 =
  // no-op) lifts dull-averaged cells toward saturated chips before the
  // snap.
  let cells = mapCellsDithered({
    cells: cellAreaAverages({ rgba: cropData, width: cropW, height: cropH, cellsX, cellsY }),
    cellsX,
    cellsY,
    palette,
    preSnapChromaScale: preSnapChromaScale ?? 1.0,
    ditherMode: ditherMode ?? "none",
    ditherPatternSize: ditherPatternSize ?? 4,
    // KY needs the LUT — reuse the same one the texture step uses. FS
    // doesn't need it (sequential error diffusion); the dispatch only
    // gates KY on LUT availability.
    blueNoiseLut: textureLut as BlueNoiseLut | null | undefined ?? null,
  })

  // (2b) Optional blue-noise texture step. Skipped when dithering is on
  // (the dither output already provides spatial quantization — stacking
  // both would double-dither). Mirrors the server-side branch in
  // `pixelate.py` so the preview and the applied SVG agree byte-for-byte
  // when both inputs match.
  if (
    (ditherMode ?? "none") === "none" &&
    textureEnabled &&
    textureStrength &&
    textureStrength > 0 &&
    textureLut &&
    palette.length > 0
  ) {
    cells = applyNeighborInvasion({
      cells,
      palette: palette.map((c) => c.rgb),
      cellsY,
      cellsX,
      strength: textureStrength,
      blueNoiseLut: textureLut,
    })
  }

  // (2c) Top-N reduction — mirrors `reduce_to_top_n` in the Python pipeline.
  // Skipped when no palette is loaded or numColors is null/<=0; otherwise
  // caps the distinct chip count to numColors so preview ↔ output match.
  if (palette.length > 0 && numColors != null && numColors > 0) {
    cells = reduceToTopN(cells, palette, numColors).cells
  }
  const { r, g, b } = cells

  // (4) Paint the cell palette onto the visible target at source-crop
  // resolution. Each cell is one solid rectangle; no source downsample
  // touches the visible canvas.
  ctx.imageSmoothingEnabled = false
  const cellW = target.width / cellsX
  const cellH = target.height / cellsY
  for (let cy = 0; cy < cellsY; cy += 1) {
    for (let cx = 0; cx < cellsX; cx += 1) {
      const i = cy * cellsX + cx
      ctx.fillStyle = `rgb(${r[i]}, ${g[i]}, ${b[i]})`
      // +1 px overdraw to avoid sub-pixel seams between adjacent cells.
      ctx.fillRect(
        Math.floor(cx * cellW),
        Math.floor(cy * cellH),
        Math.ceil(cellW) + 1,
        Math.ceil(cellH) + 1,
      )
    }
  }

  // (5) Per-cell frame outline. Mirrors the server's `<g id="grid">` —
  // always on, never toggled. Without this the preview shows raw colour
  // blocks; the applied trace would surprise users with grid lines
  // they didn't see in the dialog.
  ctx.strokeStyle = "black"
  ctx.lineWidth = 1
  for (let cy = 0; cy < cellsY; cy += 1) {
    for (let cx = 0; cx < cellsX; cx += 1) {
      ctx.strokeRect(cx * cellW, cy * cellH, cellW, cellH)
    }
  }

  // No paint-by-numbers labels in the preview — the preview's purpose
  // is a quick visual reference for "what will this look like after
  // apply", not a paint-by-numbers key. The Apply path still emits the
  // `<g id="numbers">` group in the saved SVG.
}
