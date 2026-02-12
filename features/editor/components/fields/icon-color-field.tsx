"use client"

/**
 * Editor field: color input with leading swatch.
 *
 * Responsibilities:
 * - Show a 16×16 color swatch and the HEX value in the field.
 * - Keep native `<input type="color">` behavior via an in-place swatch input
 *   so the browser picker anchors at the field (not the viewport corner).
 */
import * as React from "react"

import { InputGroupInput } from "@/components/ui/input-group"
import { IconInputGroup } from "./icon-input-group"

/**
 * Color field rendered via InputGroup:
 * - Leading swatch (16×16)
 * - Text input showing the HEX value
 * - Hidden native color input to open the picker
 */
export function IconColorField({
  value,
  onChange,
  ariaLabel,
  disabled,
  inputClassName,
}: {
  value: string
  onChange: (next: string) => void
  ariaLabel: string
  disabled?: boolean
  inputClassName?: string
}) {
  const normalizedHex = /^#([0-9a-fA-F]{6})$/.test(value) ? value : "#000000"
  const displayHex = normalizedHex.toUpperCase()

  const normalizeHexInput = React.useCallback((raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const withoutHash = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed
    const upper = withoutHash.toUpperCase()

    // Support both 3 and 6 digit hex for faster typing/paste.
    if (/^[0-9A-F]{3}$/.test(upper)) {
      const expanded = upper
        .split("")
        .map((ch) => ch + ch)
        .join("")
      return `#${expanded}`
    }
    if (/^[0-9A-F]{6}$/.test(upper)) return `#${upper}`
    return null
  }, [])

  const [draftHex, setDraftHex] = React.useState<string>(displayHex)

  React.useEffect(() => {
    setDraftHex(displayHex)
  }, [displayHex])

  const draftPreviewHex = normalizeHexInput(draftHex)
  // Preview typed values when valid; otherwise keep the persisted value.
  const swatchHex = draftPreviewHex ?? normalizedHex

  const commitDraft = React.useCallback(() => {
    const next = normalizeHexInput(draftHex)
    if (!next) {
      setDraftHex(displayHex)
      return
    }
    if (next.toUpperCase() !== displayHex) onChange(next)
    setDraftHex(next.toUpperCase())
  }, [draftHex, displayHex, normalizeHexInput, onChange])

  return (
    <IconInputGroup
      addonAlign="inline-start"
      addonClassName="px-1"
      addon={
        <input
          type="color"
          value={swatchHex}
          disabled={disabled}
          aria-label={ariaLabel}
          className={[
            // Make the native control render as a solid 16×16 swatch (no inner "tiny" swatch).
            "size-4 cursor-pointer appearance-none overflow-hidden rounded-sm border border-input bg-transparent p-0",
            "[&::-webkit-color-swatch-wrapper]:p-0",
            "[&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:p-0 [&::-webkit-color-swatch]:rounded-none",
            "[&::-moz-color-swatch]:border-0 [&::-moz-color-swatch]:p-0",
          ].join(" ")}
          onChange={(e) => {
            const next = e.target.value
            onChange(next)
            setDraftHex(next.toUpperCase())
          }}
        />
      }
    >
      <InputGroupInput
        type="text"
        value={draftHex}
        aria-label={ariaLabel}
        disabled={disabled}
        className={inputClassName}
        onChange={(e) => setDraftHex(e.target.value)}
        onBlur={() => commitDraft()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commitDraft()
          }
          if (e.key === "Escape") {
            e.preventDefault()
            setDraftHex(displayHex)
          }
        }}
      />
    </IconInputGroup>
  )
}

