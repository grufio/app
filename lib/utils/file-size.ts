/**
 * File size formatting (UI-agnostic).
 *
 * Responsibilities:
 * - Format a byte count for display in the UI using existing semantics.
 */
export function formatKbRounded(bytes: number): string {
  return `${Math.round(bytes / 1024)} kb`
}

