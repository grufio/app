"use client"

/**
 * Like `useEffect`, but skips the initial mount — only fires on
 * subsequent dependency changes. Use when an effect represents a
 * *transition* ("the key changed, react to the change") rather than
 * initialization.
 *
 * Implementation: compares deps to the previously-seen value via ref.
 * This is strict-mode safe — when React 18 dev mode double-fires
 * effects (cleanup + re-run), the second pass sees deps === prevDeps
 * and skips. A simpler `isFirstMountRef` flip would fire on the
 * strict-mode re-pass because the ref is already flipped.
 *
 * Callers don't need their own `eslint-disable react-hooks/exhaustive-deps`
 * — the disable lives here once, because `deps` is caller-controlled.
 */
import { useEffect, useRef, type DependencyList, type EffectCallback } from "react"

const UNSET = Symbol("useUpdateEffect.unset")
type PrevDeps = DependencyList | typeof UNSET

export function useUpdateEffect(effect: EffectCallback, deps?: DependencyList): void {
  const prevDepsRef = useRef<PrevDeps>(UNSET)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const prev = prevDepsRef.current
    const curr: DependencyList = deps ?? []
    prevDepsRef.current = curr
    if (prev === UNSET) return // initial mount: skip
    if (prev.length === curr.length && curr.every((d, i) => Object.is(d, prev[i]))) {
      return // deps unchanged (= strict-mode re-fire): skip
    }
    return effect()
  }, deps)
}
