/**
 * Image-state module exports (barrel).
 *
 * Responsibilities:
 * - Centralize exports for image-state parsing/validation/serialization helpers.
 */
export type { GetImageStateResponse, ImageStateRow, SaveImageStateBody } from "@/lib/editor/imageState/contracts"
export type { MicroPx } from "@/lib/editor/imageState/types"
export { MAX_PX_U, MIN_PX_U, clampMicroPx, parseBigIntString } from "@/lib/editor/imageState/micro-px"
export type { ImageStateSaveLike } from "@/lib/editor/imageState/serialize"
export { toSaveImageStateBody } from "@/lib/editor/imageState/serialize"
export type { IncomingImageStatePayload, ValidatedImageStateUpsert } from "@/lib/editor/imageState/validate"
export { validateIncomingImageStateUpsert } from "@/lib/editor/imageState/validate"

