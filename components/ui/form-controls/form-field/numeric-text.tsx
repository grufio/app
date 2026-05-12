"use client"

import * as React from "react"

import { sanitizeNumericInput } from "@/lib/editor/numeric"
import { chainHandlers } from "@/lib/forms/chain-handlers"
import {
  numericInputClassWhenUnit,
  numericUnitAddonClass,
} from "@/lib/forms/numeric-variant-classes"
import { stripWrapperKeys } from "@/lib/forms/strip-wrapper-keys"
import { useFieldDraft } from "@/lib/forms/use-field-draft"
import { cn } from "@/lib/utils"

import { AppFieldGroup, AppFieldGroupAddon, AppFieldGroupText } from "../input-group"
import { AppInput } from "../app-input"

import type {
  FormFieldHandle,
  NumericVariantProps,
  TextVariantProps,
  WithDispatcherIds,
} from "./types"

export const NumericOrTextVariant = React.forwardRef<
  FormFieldHandle,
  WithDispatcherIds<NumericVariantProps | TextVariantProps>
>(function NumericOrTextVariant(props, ref) {
  const {
    id,
    descriptionId,
    label,
    labelVisuallyHidden,
    iconStart,
    iconEnd,
    unit,
    disabled,
    inputClassName,
    inputProps,
    value,
    onCommit,
    onDraftChange,
  } = props
  const numericMode = props.variant === "numeric" ? props.numericMode ?? "decimal" : undefined

  const draft = useFieldDraft({ value, onCommit, onDraftChange })
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useImperativeHandle(
    ref,
    () => ({
      commit: () => draft.commit(),
      cancelPendingCommit: () => draft.cancelPendingCommit(),
      setDraft: (next: string) => draft.setDraft(next),
    }),
    [draft]
  )

  const inputMode =
    numericMode === "int" ? "numeric" : numericMode === "decimal" ? "decimal" : "text"

  return (
    <AppFieldGroup>
      {iconStart ? (
        <AppFieldGroupAddon align="inline-start" aria-hidden="true">
          {iconStart}
        </AppFieldGroupAddon>
      ) : null}

      <AppInput
        borderless
        ref={inputRef}
        id={id}
        type="text"
        inputMode={inputMode}
        aria-label={labelVisuallyHidden ? label : undefined}
        aria-describedby={descriptionId}
        disabled={disabled}
        className={cn(
          props.variant === "numeric" ? numericInputClassWhenUnit(unit) : null,
          inputClassName,
        )}
        value={draft.draft}
        onChange={(e) => {
          const next =
            props.variant === "numeric" && numericMode
              ? sanitizeNumericInput(e.target.value, numericMode)
              : e.target.value
          draft.setDraft(next)
        }}
        onFocus={chainHandlers(draft.inputProps.onFocus, inputProps?.onFocus)}
        onBlur={chainHandlers(draft.inputProps.onBlur, inputProps?.onBlur)}
        onKeyDown={chainHandlers(draft.inputProps.onKeyDown, inputProps?.onKeyDown)}
        {...stripWrapperKeys(inputProps)}
      />

      {unit ? (
        <AppFieldGroupAddon
          align="inline-end"
          className={numericUnitAddonClass}
          aria-hidden="true"
        >
          <AppFieldGroupText>{unit}</AppFieldGroupText>
        </AppFieldGroupAddon>
      ) : null}
      {iconEnd ? (
        <AppFieldGroupAddon align="inline-end" aria-hidden="true">
          {iconEnd}
        </AppFieldGroupAddon>
      ) : null}
    </AppFieldGroup>
  )
})
