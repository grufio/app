"use client"

/**
 * Unified form field for the editor.
 *
 * Replaces the per-domain composers (`PanelSizeField`,
 * `IconNumericField`, `IconColorField`, `IconSelectField`). Built on
 * top of the existing primitives in `components/ui/form-controls/`
 * plus the `useFieldDraft` hook for the draft+commit lifecycle.
 *
 * Four variants:
 *   - `numeric` — numeric-only input via `sanitizeNumericInput`
 *   - `text`    — free text input
 *   - `color`   — text input + color swatch picker, with hex
 *                 validation on commit
 *   - `select`  — dropdown; commits immediately on selection
 *
 * Lifecycle (numeric / text / color):
 *   - User types → `onDraftChange?` fires per keystroke
 *   - User blurs / presses Enter → `onCommit` fires if draft != value
 *   - User presses Escape → reverts to value, no commit
 *   - Upstream `value` changes while not focused → draft syncs
 *   - Upstream `value` changes while focused → user input wins
 *
 * Accessibility:
 *   - `label` always required for screen readers
 *   - `labelVisuallyHidden` renders the label sr-only (use in dense
 *     panels where space prohibits visible labels)
 *   - `id` is auto-generated via `useId()` if not provided; the
 *     visible/sr-only `<Label>` is bound via `htmlFor`
 *
 * Imperative API (via `ref`):
 *   - `commit()` — programmatic commit (e.g. an explicit Save button)
 *   - `cancelPendingCommit()` — suppress the next blur-commit, used
 *     when a sibling button click would otherwise blur+commit
 *     unintentionally (image-size lock button is the canonical case)
 *   - `focus()` — focus the underlying input
 *
 * Layout: this file is a thin dispatcher. Per-variant rendering lives
 * in sibling files (`numeric-text.tsx`, `color.tsx`, `select.tsx`) and
 * the variant union types live in `types.ts`.
 */
import * as React from "react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

import { ColorVariant } from "./color"
import { NumericOrTextVariant } from "./numeric-text"
import { SelectVariant } from "./select"
import type { FormFieldHandle, FormFieldProps } from "./types"

export type { FormFieldHandle, FormFieldProps, SelectFieldOption } from "./types"

export const FormField = React.forwardRef<FormFieldHandle, FormFieldProps>(function FormField(
  props,
  ref
) {
  const reactId = React.useId()
  const id = props.id ?? reactId

  // Variants share label rendering. Sr-only when `labelVisuallyHidden`.
  const labelEl = (
    <Label
      htmlFor={id}
      className={cn(props.labelVisuallyHidden && "sr-only", "block text-sm font-medium")}
    >
      {props.label}
    </Label>
  )

  const descriptionId = props.description ? `${id}-description` : undefined
  const descriptionEl = props.description ? (
    <p id={descriptionId} className="text-xs text-muted-foreground">
      {props.description}
    </p>
  ) : null

  const wrap = (variantEl: React.ReactNode) => (
    <div className={cn("flex flex-col gap-1", props.className)}>
      {labelEl}
      {variantEl}
      {descriptionEl}
    </div>
  )

  if (props.variant === "select") {
    return wrap(<SelectVariant {...props} id={id} descriptionId={descriptionId} ref={ref} />)
  }
  if (props.variant === "color") {
    return wrap(<ColorVariant {...props} id={id} descriptionId={descriptionId} ref={ref} />)
  }
  return wrap(<NumericOrTextVariant {...props} id={id} descriptionId={descriptionId} ref={ref} />)
})
