"use client"

import * as React from "react"

import { AppFieldGroup, AppFieldGroupAddon } from "../input-group"
import { AppSelect, AppSelectContent, AppSelectItem, AppSelectValue } from "../app-select"
import { SelectFieldControl } from "../select-field-control"

import type { FormFieldHandle, SelectVariantProps, WithDispatcherIds } from "./types"

const SelectVariantInner = React.forwardRef<
  FormFieldHandle,
  WithDispatcherIds<SelectVariantProps>
>(function SelectVariantInner(props, ref) {
  const {
    id,
    descriptionId,
    label,
    labelVisuallyHidden,
    iconStart,
    iconEnd,
    disabled,
    inputClassName,
    value,
    onCommit,
    options,
    triggerOnPointerDownCapture,
  } = props

  // Select has no internal draft — the dropdown either commits or cancels.
  React.useImperativeHandle(
    ref,
    () => ({
      commit: () => {},
      cancelPendingCommit: () => {},
    }),
    []
  )

  // Look up the active option's label so we can render it as the trigger's
  // own children. This bypasses Radix's portal-based text projection
  // (`createPortal(itemTextProps.children, valueNode)`), which re-creates
  // the portal on every item re-render and visibly flickers the trigger
  // content when the parent component re-renders for unrelated reasons.
  // Setting children on AppSelectValue makes Radix's
  // `valueNodeHasChildren` flag true, which short-circuits the portal.
  const selectedLabel = React.useMemo(
    () => options.find((opt) => opt.value === value)?.label ?? null,
    [options, value]
  )

  // Stable onValueChange so the memo wrapper above can ignore onCommit's
  // identity churn. The wrapper always reads the latest onCommit via ref.
  const onCommitRef = React.useRef(onCommit)
  React.useEffect(() => {
    onCommitRef.current = onCommit
  })
  const stableOnValueChange = React.useCallback((next: string) => {
    onCommitRef.current(next)
  }, [])

  const triggerOnPointerDownCaptureRef = React.useRef(triggerOnPointerDownCapture)
  React.useEffect(() => {
    triggerOnPointerDownCaptureRef.current = triggerOnPointerDownCapture
  })
  const stableTriggerOnPointerDownCapture = React.useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      triggerOnPointerDownCaptureRef.current?.(e)
    },
    []
  )

  return (
    <AppFieldGroup>
      {iconStart ? (
        <AppFieldGroupAddon align="inline-start" aria-hidden="true">
          {iconStart}
        </AppFieldGroupAddon>
      ) : null}

      <AppSelect value={value} onValueChange={stableOnValueChange}>
        <SelectFieldControl
          id={id}
          className={inputClassName}
          disabled={disabled}
          aria-label={labelVisuallyHidden ? label : undefined}
          aria-describedby={descriptionId}
          onPointerDownCapture={stableTriggerOnPointerDownCapture}
        >
          <AppSelectValue className="truncate">{selectedLabel}</AppSelectValue>
        </SelectFieldControl>
        <AppSelectContent>
          {options.map((opt) => (
            <AppSelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </AppSelectItem>
          ))}
        </AppSelectContent>
      </AppSelect>

      {iconEnd ? (
        <AppFieldGroupAddon align="inline-end" aria-hidden="true">
          {iconEnd}
        </AppFieldGroupAddon>
      ) : null}
    </AppFieldGroup>
  )
})

// Memo wrapper with custom comparator. We deliberately ignore callback /
// children identity (callbacks come from useCallback'd parents whose deps
// often change due to upstream object reference churn — e.g. workspaceRow
// updates), and instead key on the props that actually affect what's
// rendered. The latest callback identity is captured in a ref inside
// SelectVariant so the dropdown's onValueChange always fires the freshest
// implementation even when memo skips a re-render.
export const SelectVariant = React.memo(SelectVariantInner, (prev, next) => {
  return (
    prev.value === next.value &&
    prev.disabled === next.disabled &&
    prev.label === next.label &&
    prev.labelVisuallyHidden === next.labelVisuallyHidden &&
    prev.id === next.id &&
    prev.descriptionId === next.descriptionId &&
    prev.inputClassName === next.inputClassName &&
    prev.options === next.options &&
    prev.iconStart === next.iconStart &&
    prev.iconEnd === next.iconEnd
  )
}) as typeof SelectVariantInner
