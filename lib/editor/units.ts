export type Unit = "mm" | "cm" | "pt" | "px"

export const PX_U_SCALE = 1_000_000n // µpx per px
export const UM_PER_INCH = 25_400n // µm per inch
export const PT_PER_INCH = 72n
export const MAX_PX_U = 32_768_000_000n // 32768 px per edge at µpx scale

// Invariants / single source of truth:
// - Unit conversions are display/input only; canonical persisted truth is µpx (strings/BigInt).
// - Display formatting: up to 4dp, trim trailing zeros.
// See docs/specs/sizing-invariants.mdx

function pow10(n: number): bigint {
  return 10n ** BigInt(n)
}

export function divRoundHalfUp(n: bigint, d: bigint): bigint {
  if (d === 0n) throw new Error("division by zero")
  const q = n / d
  const r = n % d
  return r * 2n >= d ? q + 1n : q
}

/** Parses decimal string into scaled integer: "12.34" with scale=3 => 12340 */
export function parseDecimalToScaledInt(input: string, scale: number): bigint {
  const s = input.trim().replace(",", ".")
  if (!/^\d+(\.\d*)?$/.test(s)) throw new Error(`invalid number: ${input}`)
  const [a, b = ""] = s.split(".")
  const frac = (b + "0".repeat(scale)).slice(0, scale)
  const intPart = BigInt(a)
  const fracPart = BigInt(frac || "0")
  return intPart * pow10(scale) + fracPart
}

/** Formats scaled integer to string with up to maxDp, trims trailing zeros */
export function formatScaledInt(value: bigint, srcScale: number, maxDp: number): string {
  let x = value
  const diff = srcScale - maxDp
  if (diff > 0) {
    x = divRoundHalfUp(x, pow10(diff))
  } else if (diff < 0) {
    x = x * pow10(-diff)
  }

  const sign = x < 0n ? "-" : ""
  const abs = x < 0n ? -x : x
  const dp = maxDp
  const s = abs.toString().padStart(dp + 1, "0")
  const i = s.length - dp
  let out = dp === 0 ? s : `${s.slice(0, i)}.${s.slice(i)}`
  out = out.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")
  return sign + out
}

export function unitToPxU(value: string, unit: Unit, dpi: number): bigint {
  const dpiInt = BigInt(dpi)
  if (dpiInt <= 0n) throw new Error("dpi must be > 0")

  switch (unit) {
    case "px":
      return parseDecimalToScaledInt(value, 6)
    case "mm": {
      const um = parseDecimalToScaledInt(value, 3) // mm * 1000 = µm
      const n = um * dpiInt * PX_U_SCALE
      return divRoundHalfUp(n, UM_PER_INCH)
    }
    case "cm": {
      const um = parseDecimalToScaledInt(value, 4) // cm * 10000 = µm
      const n = um * dpiInt * PX_U_SCALE
      return divRoundHalfUp(n, UM_PER_INCH)
    }
    case "pt": {
      const ptU = parseDecimalToScaledInt(value, 6) // pt * 1e6
      const n = ptU * dpiInt * PX_U_SCALE
      const d = PT_PER_INCH * 1_000_000n
      return divRoundHalfUp(n, d)
    }
    default:
      throw new Error(`unsupported unit: ${unit}`)
  }
}

export function pxUToUnitDisplay(pxU: bigint, unit: Unit, dpi: number): string {
  const dpiInt = BigInt(dpi)
  if (dpiInt <= 0n) throw new Error("dpi must be > 0")

  switch (unit) {
    case "px":
      return formatScaledInt(pxU, 6, 4)
    case "mm": {
      const um = divRoundHalfUp(pxU * UM_PER_INCH, dpiInt * PX_U_SCALE)
      return formatScaledInt(um, 3, 4)
    }
    case "cm": {
      const um = divRoundHalfUp(pxU * UM_PER_INCH, dpiInt * PX_U_SCALE)
      return formatScaledInt(um, 4, 4)
    }
    case "pt": {
      const ptU = divRoundHalfUp(pxU * PT_PER_INCH * 1_000_000n, dpiInt * PX_U_SCALE)
      return formatScaledInt(ptU, 6, 4)
    }
    default:
      throw new Error(`unsupported unit: ${unit}`)
  }
}

export function pxUToPxNumber(pxU: bigint): number {
  return Number(pxU) / 1e6
}

/**
 * Convert a value from one unit to another via µpx (no float px roundtrip).
 * Use this for unit changes so 10 cm → 100 mm exactly, not 99.99 mm.
 */
export function convertUnit(value: string, fromUnit: Unit, toUnit: Unit, dpi: number): string {
  const pxU = unitToPxU(value.trim() || "0", fromUnit, dpi)
  return pxUToUnitDisplay(pxU, toUnit, dpi)
}

// Legacy numeric helpers for non-image flows (artboard, etc.).
export function unitToPx(value: number, unit: Unit, dpi: number): number {
  return pxUToPxNumber(unitToPxU(String(value), unit, dpi))
}

export function pxToUnit(px: number, unit: Unit, dpi: number): number {
  const pxU = BigInt(Math.round(px * 1e6))
  return Number(pxUToUnitDisplay(pxU, unit, dpi))
}

export function clampPx(px: number): number {
  if (!Number.isFinite(px)) return 1
  return Math.max(1, Math.round(px))
}

export function clampPxFloat(px: number): number {
  if (!Number.isFinite(px)) return 1
  return Math.max(1, px)
}

export function fmt2(n: number): string {
  if (!Number.isFinite(n)) return ""
  return n.toFixed(2).replace(/\.?0+$/, "")
}

