/**
 * Image format detection (UI-agnostic).
 *
 * Responsibilities:
 * - Provide a stable mapping from `File` MIME/type/name to a format string used by the upload API.
 * - Preserve the existing detection order (MIME first, then extension fallback).
 */
export function guessImageFormat(file: File): string {
  const mime = (file.type || "").toLowerCase()
  if (mime === "image/jpeg") return "jpeg"
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  if (mime === "image/gif") return "gif"
  if (mime === "image/svg+xml") return "svg"

  const ext = file.name.split(".").pop()?.toLowerCase()
  if (!ext) return "unknown"
  if (ext === "jpg") return "jpeg"
  return ext
}

