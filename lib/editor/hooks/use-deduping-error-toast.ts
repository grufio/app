"use client"

/**
 * Error → toast plumbing for editor flows.
 *
 * Two entry points:
 *
 * - `showOperationErrorToast(err)` — synchronous, fire-once. Use in
 *   `catch` blocks where the toast should always fire (no dedup
 *   needed because the catch only runs once per failure).
 *
 * - `useDedupingErrorToast(err)` — reactive. Use when an error value
 *   lives in component state and you want exactly one toast per
 *   distinct error. Dedup key is `correlationId` (server-stamped,
 *   unique per request) with a fallback to `stage|message` so a
 *   re-render with a fresh object identity doesn't double-toast.
 *
 * Both paths run the same normalize → format → toast pipeline; the
 * hook just wraps the fire-once helper with a re-entry guard.
 */
import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { formatOperationErrorForToast, normalizeApiError } from "@/lib/api/error-normalizer"
import { isOperationError, type OperationError } from "@/lib/api/operation-error"

export function showOperationErrorToast(err: OperationError | unknown): void {
  const op: OperationError = isOperationError(err) ? err : normalizeApiError(err)
  const formatted = formatOperationErrorForToast(op)
  const description = op.correlationId
    ? [formatted.detail, `[ref: ${op.correlationId}]`].filter(Boolean).join("\n")
    : formatted.detail
  toast.error(formatted.title, description ? { description } : undefined)
}

export function useDedupingErrorToast(err: OperationError | unknown | null): void {
  const lastKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!err) {
      lastKeyRef.current = null
      return
    }
    const op: OperationError = isOperationError(err) ? err : normalizeApiError(err)
    const key = op.correlationId ?? `${op.stage}|${op.message}`
    if (lastKeyRef.current === key) return
    lastKeyRef.current = key
    showOperationErrorToast(op)
  }, [err])
}
