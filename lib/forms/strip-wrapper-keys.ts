import type * as React from "react"

/**
 * Drop the input handler keys that `FormField` has already wired
 * through `chainHandlers`, so spreading the remaining `inputProps`
 * onto the underlying `<input>` doesn't double-bind.
 *
 * Returns `undefined` if `inputProps` was undefined — callers can
 * spread the result without a guard.
 */
export function stripWrapperKeys(
  inputProps:
    | Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "id">
    | undefined,
): React.InputHTMLAttributes<HTMLInputElement> | undefined {
  if (!inputProps) return undefined
  const { onFocus: _f, onBlur: _b, onKeyDown: _k, ...rest } = inputProps
  return rest
}
