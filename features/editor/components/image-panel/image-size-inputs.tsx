"use client"

import { ArrowLeftRight, ArrowUpDown, Link2, Unlink2 } from "lucide-react"
import { useMemo, useRef, useState } from "react"

import { PanelSizeField } from "../fields/panel-size-field"
import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"
import { RightPanelToggleIconButton } from "../right-panel-controls"
import { pxUToUnitDisplayUiFixed, type Unit } from "@/lib/editor/units"
import {
  computeLockedAspectOtherDimensionFromHeightInput,
  computeLockedAspectOtherDimensionFromWidthInput,
} from "@/services/editor/image-sizing"
import { computeImageSizeCommit, computeLockedAspectRatioFromCurrentSize } from "@/services/editor/image-sizing-operations"

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
  const [dirty, setDirty] = useState(false)
  const ignoreNextBlurCommitRef = useRef(false)
  const lockRatioRef = useRef<{ w: bigint; h: bigint } | null>(null)
  const draftWRef = useRef("")
  const draftHRef = useRef("")
  const [draftW, setDraftW] = useState("")
  const [draftH, setDraftH] = useState("")
  const [lockAspect, setLockAspect] = useState(false)

  const computedW = useMemo(() => {
    if (!ready) return ""
    if (!widthPxU) return ""
    return pxUToUnitDisplayUiFixed(widthPxU, unit)
  }, [ready, unit, widthPxU])

  const computedH = useMemo(() => {
    if (!ready) return ""
    if (!heightPxU) return ""
    return pxUToUnitDisplayUiFixed(heightPxU, unit)
  }, [heightPxU, ready, unit])

  const beginEditSession = () => {
    if (!ready) return
    if (dirty) return
    draftWRef.current = computedW
    draftHRef.current = computedH
    setDraftW(computedW)
    setDraftH(computedH)
  }

  const commit = () => {
    if (!dirty) return
    // Use refs so blur/tab commits always see the latest typed value
    // (React state can be one render behind when events batch).
    // Invariants: docs/specs/sizing-invariants.mdx (round once at input conversion).
    const parsed = computeImageSizeCommit({ ready, draftW: draftWRef.current, draftH: draftHRef.current, unit })
    if (!parsed) return
    if (widthPxU && heightPxU && parsed.wPxU === widthPxU && parsed.hPxU === heightPxU) return
    onCommit(parsed.wPxU, parsed.hPxU)
  }

  return (
    <PanelTwoFieldRow>
      <PanelSizeField
        value={dirty ? draftW : computedW}
        disabled={controlsDisabled}
        ariaLabel={`Image width (${unit})`}
        icon={<ArrowLeftRight aria-hidden="true" />}
        unit={unit}
        onValueChange={(next) => {
          beginEditSession()
          setDirty(true)
          draftWRef.current = next
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
          draftHRef.current = out.nextHeightDisplay
          setDraftH(out.nextHeightDisplay)
        }}
        onFocus={() => {
          beginEditSession()
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit()
            setDirty(false)
          }
          if (e.key === "Escape") {
            setDirty(false)
            draftWRef.current = computedW
            draftHRef.current = computedH
            setDraftW(computedW)
            setDraftH(computedH)
          }
        }}
        onBlur={() => {
          if (ignoreNextBlurCommitRef.current) {
            ignoreNextBlurCommitRef.current = false
            return
          }
          commit()
          setDirty(false)
        }}
      />

      <PanelSizeField
        value={dirty ? draftH : computedH}
        disabled={controlsDisabled}
        ariaLabel={`Image height (${unit})`}
        icon={<ArrowUpDown aria-hidden="true" />}
        unit={unit}
        onValueChange={(next) => {
          beginEditSession()
          setDirty(true)
          draftHRef.current = next
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
          draftWRef.current = out.nextWidthDisplay
          setDraftW(out.nextWidthDisplay)
        }}
        onFocus={() => {
          beginEditSession()
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit()
            setDirty(false)
          }
          if (e.key === "Escape") {
            setDirty(false)
            draftWRef.current = computedW
            draftHRef.current = computedH
            setDraftW(computedW)
            setDraftH(computedH)
          }
        }}
        onBlur={() => {
          if (ignoreNextBlurCommitRef.current) {
            ignoreNextBlurCommitRef.current = false
            return
          }
          commit()
          setDirty(false)
        }}
      />

      <PanelIconSlot>
        <RightPanelToggleIconButton
          type="button"
          active={lockAspect}
          aria-label={lockAspect ? "Unlock proportional image scaling" : "Lock proportional image scaling"}
          disabled={controlsDisabled}
          onPointerDownCapture={() => {
            // Prevent blur-commit firing when clicking the lock button.
            ignoreNextBlurCommitRef.current = true
          }}
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
