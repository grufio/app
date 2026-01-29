/**
 * Keyed draft state hook (UI helper).
 *
 * Responsibilities:
 * - Maintain a per-key draft value (e.g. per projectId) without leaking drafts across keys.
 * - Provide a derived value that falls back to the latest computed/server value when the key changes.
 *
 * Notes:
 * - This is UI state management (not business logic). Keep it small and predictable.
 */
import { useCallback, useEffect, useRef, useState } from "react"

type Keyed<T> = { key: string | null; value: T }

export function useKeyedDraft<T>(key: string | null, fallback: T) {
  const [state, setState] = useState<Keyed<T>>({ key: null, value: fallback })
  const keyRef = useRef(key)
  const fallbackRef = useRef(fallback)

  useEffect(() => {
    keyRef.current = key
    fallbackRef.current = fallback
  }, [fallback, key])

  const value = state.key === key ? state.value : fallback

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setState((prev) => {
        const k = keyRef.current
        const fb = fallbackRef.current
        const base = prev.key === k ? prev.value : fb
        const value = typeof next === "function" ? (next as (p: T) => T)(base) : next
        return { key: k, value }
      })
    },
    []
  )

  const reset = useCallback(() => {
    setState({ key: null, value: fallbackRef.current })
  }, [])

  return { value, setValue, reset }
}

