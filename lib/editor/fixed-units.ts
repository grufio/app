"use client"

/**
 * Legacy fixed-unit conversion helpers.
 *
 * Responsibilities:
 * - Provide deterministic conversions using fixed-point integers (10k/1k scales).
 * - Kept to avoid circular imports and to support older call sites/tests.
 */
// Intentionally duplicated union to avoid circular imports with `units.ts`.
export type FixedUnit = "mm" | "cm" | "pt" | "px"

// Fixed-point scales:
// - px10k: px * 10_000 (stores 4 decimals deterministically)
// - unit10k: physical unit * 10_000 (UI precision)
// - dpi1k: dpi * 1_000 (allows non-integer DPI deterministically)
const PX_SCALE_10K = 10_000n
const UNIT_SCALE_10K = 10_000n
const DPI_SCALE_1K = 1_000n

// Physical constants, as rationals:
// 1 inch = 25.4 mm = 254/10 mm
// 1 inch = 2.54 cm = 254/100 cm
// 1 inch = 72 pt
const MM_PER_INCH_NUM = 254n
const MM_PER_INCH_DEN = 10n
const CM_PER_INCH_NUM = 254n
const CM_PER_INCH_DEN = 100n
const PT_PER_INCH = 72n

function isFinitePositive(n: number): boolean {
  return Number.isFinite(n) && n > 0
}

function toFixedBigInt(n: number, scale: bigint): bigint {
  if (!Number.isFinite(n)) return 0n
  // Input is JS number, so this is a quantization boundary by design.
  return BigInt(Math.round(n * Number(scale)))
}

function fromFixedBigInt(n: bigint, scale: bigint): number {
  return Number(n) / Number(scale)
}

function roundDiv(numer: bigint, denom: bigint): bigint {
  if (denom === 0n) return 0n
  // Only positive domain is expected here.
  if (numer < 0n) return -roundDiv(-numer, denom)
  const half = denom / 2n
  return (numer + half) / denom
}

export function toPx10k(px: number): bigint {
  // Preserve current behavior: 0 when invalid.
  if (!Number.isFinite(px)) return 0n
  return toFixedBigInt(px, PX_SCALE_10K)
}

export function fromPx10k(px10k: bigint): number {
  return fromFixedBigInt(px10k, PX_SCALE_10K)
}

export function toUnit10k(v: number): bigint {
  if (!Number.isFinite(v)) return 0n
  return toFixedBigInt(v, UNIT_SCALE_10K)
}

export function fromUnit10k(v10k: bigint): number {
  return fromFixedBigInt(v10k, UNIT_SCALE_10K)
}

export function toDpi1k(dpi: number): bigint {
  if (!Number.isFinite(dpi)) return 0n
  return toFixedBigInt(dpi, DPI_SCALE_1K)
}

// NOTE:
// We implement explicit formulas per unit below for clarity and to avoid any accidental float usage.

export function pxToUnitDeterministic(px: number, unit: FixedUnit, dpi: number): number {
  if (!Number.isFinite(px)) return 0
  if (!isFinitePositive(dpi)) return 0
  if (unit === "px") return px

  const px10k = toPx10k(px)
  const dpi1k = toDpi1k(dpi)
  if (dpi1k <= 0n) return 0

  let u10k: bigint
  if (unit === "mm") {
    // mm10k = round(px10k * 25400 / dpi1k)
    u10k = roundDiv(px10k * (MM_PER_INCH_NUM * DPI_SCALE_1K) /*254000*/, dpi1k * MM_PER_INCH_DEN)
    // Simplify: 254 * 1000 / 10 = 25400
    // We keep it expanded to ensure exact integer operations.
  } else if (unit === "cm") {
    // cm10k = round(px10k * 2540 / dpi1k)
    u10k = roundDiv(px10k * (CM_PER_INCH_NUM * DPI_SCALE_1K) /*254000*/, dpi1k * CM_PER_INCH_DEN)
    // 254 * 1000 / 100 = 2540
  } else {
    // pt10k = round(px10k * 72000 / dpi1k)
    u10k = roundDiv(px10k * (PT_PER_INCH * DPI_SCALE_1K), dpi1k)
  }

  return fromUnit10k(u10k)
}

function unit10kToPx10kRounded(unit10k: bigint, unit: FixedUnit, dpi1k: bigint): bigint {
  if (dpi1k <= 0n) return 0n
  if (unit === "px") return unit10k

  if (unit === "mm") {
    // px10k = round(mm10k * dpi / 25.4) = round(mm10k * dpi1k * 10 / (254 * 1000))
    return roundDiv(unit10k * dpi1k * MM_PER_INCH_DEN, MM_PER_INCH_NUM * DPI_SCALE_1K)
  }
  if (unit === "cm") {
    // px10k = round(cm10k * dpi / 2.54) = round(cm10k * dpi1k * 100 / (254 * 1000))
    return roundDiv(unit10k * dpi1k * CM_PER_INCH_DEN, CM_PER_INCH_NUM * DPI_SCALE_1K)
  }
  // pt:
  // px10k = round(pt10k * dpi / 72) = round(pt10k * dpi1k / (72 * 1000))
  return roundDiv(unit10k * dpi1k, PT_PER_INCH * DPI_SCALE_1K)
}

function px10kToUnit10kDeterministic(px10k: bigint, unit: FixedUnit, dpi1k: bigint): bigint {
  if (dpi1k <= 0n) return 0n
  if (unit === "px") return px10k

  if (unit === "mm") {
    // mm10k = round(px10k * 25.4 / dpi) = round(px10k * 25400 / dpi1k)
    return roundDiv(px10k * (MM_PER_INCH_NUM * DPI_SCALE_1K), dpi1k * MM_PER_INCH_DEN)
  }
  if (unit === "cm") {
    // cm10k = round(px10k * 2.54 / dpi) = round(px10k * 2540 / dpi1k)
    return roundDiv(px10k * (CM_PER_INCH_NUM * DPI_SCALE_1K), dpi1k * CM_PER_INCH_DEN)
  }
  // pt10k = round(px10k * 72 / dpi) = round(px10k * 72000 / dpi1k)
  return roundDiv(px10k * (PT_PER_INCH * DPI_SCALE_1K), dpi1k)
}

function unit10kToPx10kRoundTripSafe(unit10k: bigint, unit: FixedUnit, dpi1k: bigint): bigint {
  // Goal: if px was produced from a typed unit value, converting back yields the same unit10k.
  // This mimics industry behavior: "user entered 100.0000mm" should display the same after reload.
  let px10k = unit10kToPx10kRounded(unit10k, unit, dpi1k)
  if (px10k <= 0n) return px10k

  const target = unit10k
  const back0 = px10kToUnit10kDeterministic(px10k, unit, dpi1k)
  if (back0 === target) return px10k

  // Adjust within a tiny window (monotonic mapping).
  // In practice, differences are within a few px10k ticks.
  const maxSteps = 25
  if (back0 < target) {
    for (let i = 0; i < maxSteps; i++) {
      px10k += 1n
      const back = px10kToUnit10kDeterministic(px10k, unit, dpi1k)
      if (back === target) return px10k
      if (back > target) break
    }
  } else {
    for (let i = 0; i < maxSteps; i++) {
      px10k -= 1n
      const back = px10kToUnit10kDeterministic(px10k, unit, dpi1k)
      if (back === target) return px10k
      if (back < target) break
      if (px10k <= 0n) break
    }
  }

  return unit10kToPx10kRounded(unit10k, unit, dpi1k)
}

export function unitToPxDeterministic(value: number, unit: FixedUnit, dpi: number): number {
  if (!Number.isFinite(value)) return 0
  if (!isFinitePositive(dpi)) return 0
  if (unit === "px") return value

  const unit10k = toUnit10k(value)
  const dpi1k = toDpi1k(dpi)
  if (dpi1k <= 0n) return 0

  const px10k = unit10kToPx10kRoundTripSafe(unit10k, unit, dpi1k)
  return fromPx10k(px10k)
}

export function roundTripUnit10kFromPx10k(px10k: bigint, unit: FixedUnit, dpi: number): bigint {
  const dpi1k = toDpi1k(dpi)
  return px10kToUnit10kDeterministic(px10k, unit, dpi1k)
}

