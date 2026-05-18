import { computeImagePlacementPx, type ImagePlacementPx } from "./placement"

export type RestoreBaseSpec = {
  imageId: string | null
  widthPx: number
  heightPx: number
  dpi?: number | null
}

export function resolveRestoreImageRequest(args: {
  artW: number
  artH: number
  baseSpec: RestoreBaseSpec | null
  activeImageId?: string | null
}): { ok: true; placement: ImagePlacementPx } | { ok: false; reason: "not_ready" | "missing_base_spec" | "stale_base_spec" } {
  const { artW, artH, baseSpec, activeImageId } = args
  if (!(artW > 0 && artH > 0)) return { ok: false, reason: "not_ready" }
  if (!baseSpec) return { ok: false, reason: "missing_base_spec" }
  if (activeImageId && baseSpec.imageId && activeImageId !== baseSpec.imageId) return { ok: false, reason: "stale_base_spec" }
  if (!(baseSpec.widthPx > 0 && baseSpec.heightPx > 0)) return { ok: false, reason: "missing_base_spec" }

  const placement = computeImagePlacementPx({
    artW,
    artH,
    intrinsicW: baseSpec.widthPx,
    intrinsicH: baseSpec.heightPx,
    imageDpi: baseSpec.dpi,
  })
  if (!placement) return { ok: false, reason: "not_ready" }

  return { ok: true, placement }
}
