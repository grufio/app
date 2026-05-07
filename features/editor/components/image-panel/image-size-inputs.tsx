"use client"

/**
 * Image width / height inputs with optional aspect-ratio lock.
 *
 * Phase 3.4 of the form-fields unification — the most complex caller
 * because of the aspect-lock + lock-button-cancel interaction. The
 * old version had ~120 lines of draft / dirty / ignoreNextBlur
 * mechanics; FormField + its imperative `cancelPendingCommit`
 * handle replace it cleanly.
 *
 * Lifecycle:
 *  - Each FormField has its own internal draft (commit on blur/Enter).
 *  - When aspect-lock is ON, `onDraftChange` from one field computes
 *    the locked partner dimension and updates the partner's local
 *    draft state, which the partner FormField syncs into its own
 *    internal draft (since it isn't focused).
 *  - On commit, we compute the canonical bigint µpx pair from the
 *    LATEST drafts of *both* axes (read from local state) and call
 *    onCommit with both.
 *  - The lock button click cancels the pending blur-commit on both
 *    fields via the imperative ref, so toggling the lock doesn't
 *    accidentally save a stale in-flight draft.
 */
import { ArrowLeftRight, ArrowUpDown, Link2, Unlink2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

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

  const [draftW, setDraftW] = useState(computedW)
  const [draftH, setDraftH] = useState(computedH)
  const [lockAspect, setLockAspect] = useState(false)
  const lockRatioRef = useRef<{ w: bigint; h: bigint } | null>(null)
  const widthRef = useRef<FormFieldHandle>(null)
  const heightRef = useRef<FormFieldHandle>(null)

  // Sync local drafts to upstream when upstream changes. FormField's
  // own draft has the same logic; we mirror it here so the cross-axis
  // partner lookups in onDraftChange always see fresh values.
  useEffect(() => {
    setDraftW(computedW)
  }, [computedW])
  useEffect(() => {
    setDraftH(computedH)
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
      setDraftW(next)
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
      setDraftH(out.nextHeightDisplay)
    },
    [lockAspect, unit, widthPxU, heightPxU]
  )

  const onDraftH = useCallback(
    (next: string) => {
      setDraftH(next)
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
      setDraftW(out.nextWidthDisplay)
    },
    [lockAspect, unit, widthPxU, heightPxU]
  )

  const onCommitW = useCallback(
    (nextW: string) => {
      setDraftW(nextW)
      commitFromDrafts(nextW, draftH)
    },
    [commitFromDrafts, draftH]
  )

  const onCommitH = useCallback(
    (nextH: string) => {
      setDraftH(nextH)
      commitFromDrafts(draftW, nextH)
    },
    [commitFromDrafts, draftW]
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
        value={draftW}
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
        value={draftH}
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
