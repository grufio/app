"use client"

/**
 * Read/write a boolean flag from localStorage with React-state semantics.
 *
 * Used for editor preferences that should survive page reloads but
 * aren't worth round-tripping to the server (e.g. "lock aspect ratio
 * by default", panel collapse states, view settings).
 *
 * Behaviour:
 *   - On mount, reads the stored value (or `defaultValue` if absent /
 *     unparseable / SSR).
 *   - Writes are synchronous to localStorage AND state — readers
 *     observe the new value on the next render without a storage round-
 *     trip race.
 *   - Cross-tab sync: listens to the `storage` event so a flip in tab A
 *     reflects in tab B.
 *
 * Returns the same shape as `useState<boolean>`.
 */
import { useCallback, useEffect, useState } from "react"

function readBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    if (raw === "true") return true
    if (raw === "false") return false
    return fallback
  } catch {
    // localStorage may be unavailable (private mode, quota, etc.) —
    // fall back silently.
    return fallback
  }
}

export function useLocalStorageBoolean(
  key: string,
  defaultValue: boolean,
): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const [value, setValue] = useState<boolean>(() => readBoolean(key, defaultValue))

  const set = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: boolean) => boolean)(prev) : next
        try {
          window.localStorage.setItem(key, String(resolved))
        } catch {
          /* see readBoolean — silent fallback */
        }
        return resolved
      })
    },
    [key],
  )

  // Cross-tab sync.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== key) return
      if (e.newValue === null) {
        setValue(defaultValue)
        return
      }
      if (e.newValue === "true") setValue(true)
      else if (e.newValue === "false") setValue(false)
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [key, defaultValue])

  return [value, set]
}
