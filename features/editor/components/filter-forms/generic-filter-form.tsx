"use client"

/**
 * Schema-driven filter form (F7).
 *
 * Renders one input per ui-hint that carries a `label`; field type
 * comes from `kind` (default `int` when `options` is absent, `select`
 * when present). Calls the registry's optional `helperState` hook
 * after the schema fields, and the `transformBeforeSubmit` hook to
 * inject context-only params right before `onApply`.
 *
 * Replaces the per-filter `lineart-form.tsx` / `pixelate-form.tsx` /
 * `numerate-form.tsx` (~410 LOC combined) without losing label,
 * description, validation, or live-helper behaviour.
 */
import { useMemo, useState } from "react"
import type * as React from "react"

import type { z } from "zod"

import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { FormField } from "@/components/ui/form-controls"
import type {
  FilterDefinition,
  FilterFieldKind,
  FilterFieldUI,
  FilterRenderContext,
} from "@/lib/editor/filters/types"

import { FilterFormFooter } from "./filter-form-footer"

type GenericFilterFormProps<TSchema extends z.ZodType, TCtx = FilterRenderContext> = {
  filterDef: FilterDefinition<TSchema, TCtx>
  ctx: TCtx
  busy?: boolean
  applyingLabel?: string
  onCancel: () => void
  onApply: (params: z.infer<TSchema>) => void
}

function fieldKind(hint: FilterFieldUI): FilterFieldKind {
  if (hint.kind) return hint.kind
  if (hint.options) return "select"
  return "int"
}

function setNumeric(set: (n: number) => void) {
  return (raw: string) => {
    const n = Number(raw)
    if (Number.isFinite(n)) set(n)
  }
}

export function GenericFilterForm<TSchema extends z.ZodType, TCtx = FilterRenderContext>({
  filterDef,
  ctx,
  busy = false,
  applyingLabel,
  onCancel,
  onApply,
}: GenericFilterFormProps<TSchema, TCtx>) {
  // Schema defaults seed the per-field state. We keep a flat record
  // (`Record<string, unknown>`) because the registry doesn't know which
  // exact zod shape the schema parses into — once `safeParse` returns
  // we narrow back to TSchema for `onApply`.
  const defaults = useMemo(() => filterDef.schema.parse({}) as Record<string, unknown>, [filterDef.schema])
  const [draft, setDraft] = useState<Record<string, unknown>>(defaults)

  const setField = (key: string, value: unknown) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const validation = useMemo(() => filterDef.schema.safeParse(draft), [filterDef.schema, draft])
  const isValid = validation.success

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || busy || !validation.success) return
    const collected = validation.data as z.infer<TSchema>
    const next = filterDef.transformBeforeSubmit
      ? filterDef.transformBeforeSubmit({ params: collected, ctx })
      : collected
    onApply(next)
  }

  const formFields = Object.entries(filterDef.ui ?? {}).filter(([, hint]) => Boolean(hint.label))

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-col gap-7">
        {formFields.map(([name, hint]) => {
          const kind = fieldKind(hint)
          const value = draft[name]

          if (kind === "boolean") {
            const checked = value === true
            return (
              <div key={name} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={name}
                    checked={checked}
                    onCheckedChange={(c) => setField(name, c === true)}
                    disabled={busy}
                  />
                  <Label htmlFor={name} className="cursor-pointer font-normal">
                    {hint.label}
                  </Label>
                </div>
                {hint.description ? (
                  <p className="text-xs text-muted-foreground">{hint.description}</p>
                ) : null}
              </div>
            )
          }

          if (kind === "select") {
            return (
              <FormField
                key={name}
                variant="select"
                label={hint.label as string}
                id={name}
                value={String(value ?? "")}
                options={hint.options ?? []}
                onCommit={(v) => setField(name, v)}
                disabled={busy}
                description={hint.description}
              />
            )
          }

          // numeric: int or decimal
          const numericMode = kind === "decimal" ? "decimal" : "int"
          return (
            <FormField
              key={name}
              variant="numeric"
              numericMode={numericMode}
              label={hint.label as string}
              id={name}
              value={String(value ?? "")}
              onCommit={setNumeric((n) => setField(name, n))}
              onDraftChange={setNumeric((n) => setField(name, n))}
              disabled={busy}
              description={hint.description}
              inputProps={{ min: hint.min, max: hint.max, step: hint.step }}
            />
          )
        })}

        {filterDef.helperState
          ? filterDef.helperState({ params: validation.success ? (validation.data as z.infer<TSchema>) : (draft as z.infer<TSchema>), ctx })
          : null}
      </div>

      <FilterFormFooter onCancel={onCancel} isValid={isValid} busy={busy} applyingLabel={applyingLabel} />
    </form>
  )
}
