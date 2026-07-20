/**
 * Master-image value type + pure helpers, shared by the image-workflow machine
 * (which now owns the master read-model), the SSR loader, and the adapter.
 * Extracted from the former `use-master-image` hook (read-model migration).
 */

export type MasterImage = {
  id: string
  /** Stable per-project identity = the immutable `kind='master'` row id.
   * Distinct from `id` (the active/editor-target image, which flips on
   * filter/crop/trace apply). Used as the reset key for the persisted
   * display transform + canvas mirror so those survive an apply and
   * only reset on a real master delete/replace. Null when no master. */
  masterRowId: string | null
  /** Signed URL of the **active** image row — the working_copy /
   * filter_working_copy / trace_output chain tip. */
  signedUrl: string
  /** Signed URL of the **kind='master'** row specifically — the raw
   * initial upload. Empty string when master sign failed (graceful degrade). */
  masterSignedUrl: string
  width_px: number
  height_px: number
  dpi: number | null
  name: string
  restore_base?: {
    id: string
    width_px: number
    height_px: number
    dpi?: number | null
  } | null
}

export function toMasterImage(payload: {
  id?: unknown
  masterRowId?: unknown
  signedUrl?: unknown
  masterSignedUrl?: unknown
  width_px?: unknown
  height_px?: unknown
  dpi?: unknown
  name?: unknown
  restore_base?: unknown
}): MasterImage {
  const base = payload.restore_base as
    | { id?: unknown; width_px?: unknown; height_px?: unknown; dpi?: unknown }
    | null
    | undefined
  return {
    id: String(payload.id ?? ""),
    masterRowId: payload.masterRowId == null ? null : String(payload.masterRowId),
    signedUrl: String(payload.signedUrl ?? ""),
    masterSignedUrl: String(payload.masterSignedUrl ?? ""),
    width_px: Number(payload.width_px ?? 0),
    height_px: Number(payload.height_px ?? 0),
    dpi: payload.dpi == null ? null : Number(payload.dpi),
    name: String(payload.name ?? "master image"),
    restore_base:
      base && base.id != null
        ? {
            id: String(base.id),
            width_px: Number(base.width_px ?? 0),
            height_px: Number(base.height_px ?? 0),
            dpi: base.dpi == null ? null : Number(base.dpi),
          }
        : null,
  }
}

/** Change-detection signature — assign a new master into machine context only
 * when this changes, so the object identity (and the derived source snapshot)
 * doesn't churn on every refresh. */
export function masterImageSignature(img: MasterImage | null): string {
  if (!img) return "__missing__"
  return `${img.id}|${img.masterRowId ?? ""}|${img.signedUrl}|${img.masterSignedUrl}|${img.width_px}|${img.height_px}|${img.dpi ?? ""}|${img.name}|${img.restore_base?.id ?? ""}|${img.restore_base?.width_px ?? ""}|${img.restore_base?.height_px ?? ""}|${img.restore_base?.dpi ?? ""}`
}
