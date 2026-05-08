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
 */
import * as React from "react"

import { Label } from "@/components/ui/label"
import { sanitizeNumericInput, type NumericMode } from "@/lib/editor/numeric"
import { normalizeHex } from "@/lib/forms/normalize-hex"
import { useFieldDraft } from "@/lib/forms/use-field-draft"
import { cn } from "@/lib/utils"

import { AppFieldGroup, AppFieldGroupAddon, AppFieldGroupText } from "./field-group"
import { AppSelect, AppSelectContent, AppSelectItem, AppSelectValue } from "./app-select"
import { ColorSwatchControl } from "./color-swatch-control"
import { FieldControl } from "./field-control"
import { SelectFieldControl } from "./select-field-control"

export type FormFieldHandle = {
  commit: () => void
  cancelPendingCommit: () => void
  focus: () => void
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

type NumericVariantProps = CommonFormFieldProps & {
  variant: "numeric"
  value: string
  onCommit: (next: string) => void
  onDraftChange?: (next: string) => void
  numericMode?: NumericMode
}

type TextVariantProps = CommonFormFieldProps & {
  variant: "text"
  value: string
  onCommit: (next: string) => void
  onDraftChange?: (next: string) => void
}

type ColorVariantProps = CommonFormFieldProps & {
  variant: "color"
  value: string
  onCommit: (next: string) => void
}

export type SelectFieldOption = {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

type SelectVariantProps = CommonFormFieldProps & {
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

/** Chain a built-in handler with a user-provided one. Built-in fires first. */
function chainHandlers<E>(
  builtin: ((e: E) => void) | undefined,
  user: ((e: E) => void) | undefined
): ((e: E) => void) | undefined {
  if (!builtin) return user
  if (!user) return builtin
  return (e: E) => {
    builtin(e)
    user(e)
  }
}

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

  // Render via variant. Each branch wires the appropriate primitive +
  // (for non-select) the draft hook, plus the imperative handle.
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

// --- Numeric / Text variant ---------------------------------------------

const NumericOrTextVariant = React.forwardRef<
  FormFieldHandle,
  (NumericVariantProps | TextVariantProps) & { id: string; descriptionId?: string }
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
      focus: () => inputRef.current?.focus(),
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

      <FieldControl
        ref={inputRef}
        id={id}
        type="text"
        inputMode={inputMode}
        aria-label={labelVisuallyHidden ? label : undefined}
        aria-describedby={descriptionId}
        disabled={disabled}
        className={inputClassName}
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
        <AppFieldGroupAddon align="inline-end" className="pointer-events-none" aria-hidden="true">
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

// Strip handlers we already chained so we don't double-spread them.
function stripWrapperKeys(
  inputProps: CommonFormFieldProps["inputProps"]
): React.InputHTMLAttributes<HTMLInputElement> | undefined {
  if (!inputProps) return undefined
  const { onFocus: _f, onBlur: _b, onKeyDown: _k, ...rest } = inputProps
  return rest
}

// --- Color variant ------------------------------------------------------

const ColorVariant = React.forwardRef<
  FormFieldHandle,
  ColorVariantProps & { id: string; descriptionId?: string }
>(function ColorVariant(props, ref) {
  const { id, descriptionId, label, labelVisuallyHidden, disabled, inputClassName, value, onCommit } = props

    const normalized = normalizeHex(value) ?? "#000000"
    const display = normalized.toUpperCase()

    const [draft, setDraft] = React.useState(display)
    const [isFocused, setIsFocused] = React.useState(false)
    const cancelPendingRef = React.useRef(false)
    const inputRef = React.useRef<HTMLInputElement>(null)

    // Sync upstream into draft when not focused (mirrors useFieldDraft).
    React.useEffect(() => {
      if (!isFocused) setDraft(display)
    }, [display, isFocused])

    const commit = React.useCallback(() => {
      const norm = normalizeHex(draft)
      if (norm === null) {
        // Invalid input → revert silently.
        setDraft(display)
        return
      }
      if (norm !== display) {
        onCommit(norm)
      }
      setDraft(norm)
    }, [draft, display, onCommit])

    React.useImperativeHandle(
      ref,
      () => ({
        commit: () => commit(),
        cancelPendingCommit: () => {
          cancelPendingRef.current = true
        },
        focus: () => inputRef.current?.focus(),
      }),
      [commit]
    )

    return (
      <AppFieldGroup>
        <AppFieldGroupAddon align="inline-start" className="px-1">
          <ColorSwatchControl
            value={normalizeHex(draft) ?? normalized}
            disabled={disabled}
            aria-label={label}
            onChange={(e) => {
              const next = e.target.value
              onCommit(next)
              setDraft(next.toUpperCase())
            }}
          />
        </AppFieldGroupAddon>
        <FieldControl
          ref={inputRef}
          id={id}
          type="text"
          aria-label={labelVisuallyHidden ? label : undefined}
          aria-describedby={descriptionId}
          disabled={disabled}
          className={inputClassName}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false)
            if (cancelPendingRef.current) {
              cancelPendingRef.current = false
              setDraft(display)
              return
            }
            commit()
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commit()
            }
            if (e.key === "Escape") {
              e.preventDefault()
              setDraft(display)
            }
          }}
        />
      </AppFieldGroup>
    )
  }
)

// --- Select variant -----------------------------------------------------

const SelectVariantInner = React.forwardRef<
  FormFieldHandle,
  SelectVariantProps & { id: string; descriptionId?: string }
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
      focus: () => {},
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
const SelectVariant = React.memo(SelectVariantInner, (prev, next) => {
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
