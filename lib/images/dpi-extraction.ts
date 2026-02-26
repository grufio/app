/**
 * Extract DPI metadata from image files.
 *
 * Responsibilities:
 * - Read EXIF metadata (XResolution, YResolution, ResolutionUnit)
 * - Provide fallback DPI when EXIF is missing
 * - Normalize to consistent DPI format
 */
import exifr from "exifr"

export type ImageDPI = {
  dpiX: number
  dpiY: number
  source: "exif" | "fallback"
}

const FALLBACK_DPI = 72 // Standard for web/screenshots without EXIF

/**
 * Extract DPI from image file.
 * Returns fallback 72 DPI if EXIF metadata is missing.
 */
export async function extractImageDPI(file: File): Promise<ImageDPI> {
  try {
    const exif = await exifr.parse(file, {
      xResolution: true,
      yResolution: true,
      resolutionUnit: true,
    })

    if (!exif) {
      return { dpiX: FALLBACK_DPI, dpiY: FALLBACK_DPI, source: "fallback" }
    }

    const xRes = exif.XResolution
    const yRes = exif.YResolution
    const unit = exif.ResolutionUnit

    // ResolutionUnit: 2 = inches, 3 = centimeters
    if (typeof xRes === "number" && typeof yRes === "number" && unit === 2) {
      return {
        dpiX: Math.round(xRes),
        dpiY: Math.round(yRes),
        source: "exif",
      }
    }

    // Convert from cm to inches if unit = 3
    if (typeof xRes === "number" && typeof yRes === "number" && unit === 3) {
      return {
        dpiX: Math.round(xRes * 2.54),
        dpiY: Math.round(yRes * 2.54),
        source: "exif",
      }
    }

    return { dpiX: FALLBACK_DPI, dpiY: FALLBACK_DPI, source: "fallback" }
  } catch {
    return { dpiX: FALLBACK_DPI, dpiY: FALLBACK_DPI, source: "fallback" }
  }
}
