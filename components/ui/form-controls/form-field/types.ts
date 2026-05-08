import type * as React from "react"

import type { NumericMode } from "@/lib/editor/numeric"

export type FormFieldHandle = {
  commit: () => void
  cancelPendingCommit: () => void
}

type CommonFormFieldProps = {
  label: string
  labelVisuallyHidden?: boolean
  /** Helper text shown below the field (filter-form usage). */
  description?: React.ReactNode
  id?: string
  iconStart?: React.ReactNode
  iconEnd?: React.ReactNode
  unit?: string
  disabled?: boolean
  className?: string
  inputClassName?: string
  /** Escape hatch for native input attributes that the variant doesn't model. */
  inputProps?: Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type" | "id"
  >
}

export type NumericVariantProps = CommonFormFieldProps & {
  variant: "numeric"
  value: string
  onCommit: (next: string) => void
  onDraftChange?: (next: string) => void
  numericMode?: NumericMode
}

export type TextVariantProps = CommonFormFieldProps & {
  variant: "text"
  value: string
  onCommit: (next: string) => void
  onDraftChange?: (next: string) => void
}

export type ColorVariantProps = CommonFormFieldProps & {
  variant: "color"
  value: string
  onCommit: (next: string) => void
}

export type SelectFieldOption = {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

export type SelectVariantProps = CommonFormFieldProps & {
  variant: "select"
  value: string
  /** For select variant, fires immediately on user selection. */
  onCommit: (next: string) => void
  /**
   * Structured option list. We render the trigger's display text directly
   * from this list (instead of letting Radix portal it from the selected
   * <SelectItem>). The portal path was visibly flickering on parent re-
   * renders because Radix re-creates the portal on each item re-render.
   */
  options: ReadonlyArray<SelectFieldOption>
  /**
   * Native pointer-down-capture on the trigger — used by callers that need
   * to suppress sibling field commits while the dropdown opens.
   */
  triggerOnPointerDownCapture?: React.PointerEventHandler<HTMLButtonElement>
}

export type FormFieldProps =
  | NumericVariantProps
  | TextVariantProps
  | ColorVariantProps
  | SelectVariantProps

/** Internal — type used by variant components after the dispatcher injects `id` + `descriptionId`. */
export type WithDispatcherIds<P> = P & { id: string; descriptionId?: string }
