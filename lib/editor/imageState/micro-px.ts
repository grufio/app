import type { MicroPx } from "./types"
import { MAX_PX_U, PX_U_SCALE } from "../units"

export const MIN_PX_U = PX_U_SCALE
export { MAX_PX_U }

export function parseBigIntString(value: unknown): MicroPx | null {
  if (typeof value !== "string") return null
  try {
    return BigInt(value) as MicroPx
  } catch {
    return null
  }
}

export function clampMicroPx(value: MicroPx): MicroPx {
  if (value < MIN_PX_U) return MIN_PX_U
  if (value > MAX_PX_U) return MAX_PX_U
  return value
}

