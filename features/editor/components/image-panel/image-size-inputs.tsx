"use client"

/**
 * Image width / height inputs with optional aspect-ratio lock.
 *
 * Lifecycle:
 *  - Each FormField has its own internal draft (commit on blur/Enter).
 *    `value` is bound to the prop-derived display (`computedW` /
 *    `computedH`) — NEVER to a parent draft state, because feeding a
 *    parent's draft back into FormField's `value` while the input is
 *    focused creates an echo-loop where the reducer marks
 *    `state.value === state.draft` and the blur step silently
 *    skips commit. See `lib/forms/field-draft-reducer.test.ts` for
 *    the regression test that locks that contract.
 *  - When aspect-lock is ON, `onDraftChange` from one field computes
 *    the locked partner dimension. The partner FormField's internal
 *    draft is updated **imperatively** via `partnerRef.current.setDraft`
 *    (no parent state involved). `latestDraft*Ref` mirrors the typed
 *    values so `commitFromDrafts` can read both axes without a re-
 *    render dependency.
 *  - On commit, we compute the canonical bigint µpx pair from
 *    `latestDraft*Ref` (which holds either the user's typing or the
 *    aspect-lock-derived partner) and call `onCommit` with both.
 *  - The lock-button click cancels pending blur-commits on both
 *    fields via the imperative ref, so toggling the lock doesn't
 *    accidentally save a stale in-flight draft.
 */
import { ArrowLeftRight, ArrowUpDown, Link2, Unlink2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef } from "react"

import { FormField, type FormFieldHandle } from "@/components/ui/form-controls"
import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"
import { RightPanelToggleIconButton } from "../right-panel-controls"
import { pxUToUnitDisplayUiFixed, type Unit } from "@/lib/editor/units"
import {
  computeLockedAspectOtherDimensionFromHeightInput,
  computeLockedAspectOtherDimensionFromWidthInput,
} from "@/services/editor/image-sizing"
import {
  computeImageSizeCommit,
  computeLockedAspectRatioFromCurrentSize,
} from "@/services/editor/image-sizing-operations"
import { useLocalStorageBoolean } from "@/lib/storage/use-local-storage-boolean"

export function ImageSizeInputs({
  widthPxU,
  heightPxU,
  unit,
  ready,
  controlsDisabled,
  onCommit,
}: {
  widthPxU?: bigint
  heightPxU?: bigint
  unit: Unit
  ready: boolean
  controlsDisabled: boolean
  onCommit: (widthPxU: bigint, heightPxU: bigint) => void
}) {
  const computedW = useMemo(() => {
    if (!ready || !widthPxU) return ""
    return pxUToUnitDisplayUiFixed(widthPxU, unit)
  }, [ready, unit, widthPxU])

  const computedH = useMemo(() => {
    if (!ready || !heightPxU) return ""
    return pxUToUnitDisplayUiFixed(heightPxU, unit)
  }, [heightPxU, ready, unit])

  const [lockAspect, setLockAspect] = useLocalStorageBoolean("editor:lock-aspect", false)
  const lockRatioRef = useRef<{ w: bigint; h: bigint } | null>(null)
  const widthRef = useRef<FormFieldHandle>(null)
  const heightRef = useRef<FormFieldHandle>(null)

  // Refs hold the latest typed values for each axis. Updated by
  // `onDraftChange` (user typing) and by aspect-lock cross-axis push.
  // No useState — passing parent state back to FormField's `value`
  // creates the echo-loop documented above.
  const latestDraftW = useRef(computedW)
  const latestDraftH = useRef(computedH)
  useEffect(() => {
    latestDraftW.current = computedW
  }, [computedW])
  useEffect(() => {
    latestDraftH.current = computedH
  }, [computedH])

  const commitFromDrafts = useCallback(
    (nextDraftW: string, nextDraftH: string) => {
      const parsed = computeImageSizeCommit({
        ready,
        draftW: nextDraftW,
        draftH: nextDraftH,
        unit,
      })
      if (!parsed) return
      if (widthPxU && heightPxU && parsed.wPxU === widthPxU && parsed.hPxU === heightPxU) return
      onCommit(parsed.wPxU, parsed.hPxU)
    },
    [ready, unit, widthPxU, heightPxU, onCommit]
  )

  const onDraftW = useCallback(
    (next: string) => {
      latestDraftW.current = next
      if (!lockAspect) return
      const r = lockRatioRef.current ?? computeLockedAspectRatioFromCurrentSize({ widthPxU, heightPxU })
      if (!r) return
      lockRatioRef.current = r
      const out = computeLockedAspectOtherDimensionFromWidthInput({
        nextWidthInput: next,
        unit,
        ratio: { wPxU: r.w, hPxU: r.h },
      })
      if (!out) return
      latestDraftH.current = out.nextHeightDisplay
      heightRef.current?.setDraft(out.nextHeightDisplay)
    },
    [lockAspect, unit, widthPxU, heightPxU]
  )

  const onDraftH = useCallback(
    (next: string) => {
      latestDraftH.current = next
      if (!lockAspect) return
      const r = lockRatioRef.current ?? computeLockedAspectRatioFromCurrentSize({ widthPxU, heightPxU })
      if (!r) return
      lockRatioRef.current = r
      const out = computeLockedAspectOtherDimensionFromHeightInput({
        nextHeightInput: next,
        unit,
        ratio: { wPxU: r.w, hPxU: r.h },
      })
      if (!out) return
      latestDraftW.current = out.nextWidthDisplay
      widthRef.current?.setDraft(out.nextWidthDisplay)
    },
    [lockAspect, unit, widthPxU, heightPxU]
  )

  const onCommitW = useCallback(
    (nextW: string) => {
      latestDraftW.current = nextW
      commitFromDrafts(nextW, latestDraftH.current)
    },
    [commitFromDrafts]
  )

  const onCommitH = useCallback(
    (nextH: string) => {
      latestDraftH.current = nextH
      commitFromDrafts(latestDraftW.current, nextH)
    },
    [commitFromDrafts]
  )

  const cancelPendingCommits = useCallback(() => {
    widthRef.current?.cancelPendingCommit()
    heightRef.current?.cancelPendingCommit()
  }, [])

  return (
    <PanelTwoFieldRow>
      <FormField
        ref={widthRef}
        variant="numeric"
        label={`Image width (${unit})`}
        labelVisuallyHidden
        iconStart={<ArrowLeftRight aria-hidden="true" />}
        unit={unit}
        value={computedW}
        onDraftChange={onDraftW}
        onCommit={onCommitW}
        disabled={controlsDisabled}
      />

      <FormField
        ref={heightRef}
        variant="numeric"
        label={`Image height (${unit})`}
        labelVisuallyHidden
        iconStart={<ArrowUpDown aria-hidden="true" />}
        unit={unit}
        value={computedH}
        onDraftChange={onDraftH}
        onCommit={onCommitH}
        disabled={controlsDisabled}
      />

      <PanelIconSlot>
        <RightPanelToggleIconButton
          type="button"
          active={lockAspect}
          aria-label={lockAspect ? "Unlock proportional image scaling" : "Lock proportional image scaling"}
          disabled={controlsDisabled}
          onPointerDownCapture={cancelPendingCommits}
          onClick={() => {
            setLockAspect((prev) => {
              const next = !prev
              lockRatioRef.current = next ? computeLockedAspectRatioFromCurrentSize({ widthPxU, heightPxU }) : null
              return next
            })
          }}
        >
          {lockAspect ? <Link2 className="size-4" strokeWidth={1} /> : <Unlink2 className="size-4" strokeWidth={1} />}
        </RightPanelToggleIconButton>
      </PanelIconSlot>
    </PanelTwoFieldRow>
  )
}
