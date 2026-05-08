/**
 * Chain a built-in event handler with a user-provided one.
 *
 * The built-in handler always fires first. Either side may be
 * `undefined`, in which case the other is returned as-is (or
 * `undefined` if both are absent).
 *
 * Used by `FormField` to compose its internal `useFieldDraft`
 * lifecycle handlers (`onFocus` / `onBlur` / `onKeyDown`) with any
 * extra handlers the caller passed via `inputProps`. The caller's
 * handler runs *after* the built-in so it can observe the post-state
 * but cannot prevent the lifecycle from firing.
 */
export function chainHandlers<E>(
  builtin: ((e: E) => void) | undefined,
  user: ((e: E) => void) | undefined,
): ((e: E) => void) | undefined {
  if (!builtin) return user
  if (!user) return builtin
  return (e: E) => {
    builtin(e)
    user(e)
  }
}
