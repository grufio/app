"use client"

import * as React from "react"

import { normalizeHex } from "@/lib/forms/normalize-hex"

import { AppFieldGroup, AppFieldGroupAddon } from "../input-group"
import { AppInput } from "../app-input"
import { ColorSwatchControl } from "../color-swatch-control"

import type { ColorVariantProps, FormFieldHandle, WithDispatcherIds } from "./types"

export const ColorVariant = React.forwardRef<
  FormFieldHandle,
  WithDispatcherIds<ColorVariantProps>
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
      setDraft: (next: string) => setDraft(next),
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
      <AppInput
        borderless
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
})
