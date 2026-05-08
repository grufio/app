"use client"

/**
 * Client-side renderer for the dev-only form primitives gallery.
 *
 * Layout principle: one section per primitive family, one row per
 * variant axis, one cell per state. Width-fluid so the resizable-
 * panel quirks (e.g. numeric+unit gap) surface here when we drag the
 * window narrower.
 *
 * Don't add interaction logic that mutates app state — this is a
 * gallery, not a sandbox. All `onCommit`s are no-ops.
 */
import * as React from "react"
import { Hash, Percent, Ruler } from "lucide-react"

import { AppButton, AppFieldGroup, AppFieldGroupAddon, AppInput, FormField } from "@/components/ui/form-controls"
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/form-controls/app-select"

const noop = () => {}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-b py-6">
      <h2 className="font-mono text-sm uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_minmax(0,1fr)] items-start gap-4">
      <div className="pt-1 text-xs text-muted-foreground">{label}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  )
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}

export function FormPrimitivesDemoClient() {
  // Local state so inputs feel real (commit is still a no-op).
  const [num, setNum] = React.useState("128")
  const [text, setText] = React.useState("Hello")
  const [color, setColor] = React.useState("#7C3AED")
  const [select, setSelect] = React.useState("medium")
  const selectOptions = [
    { value: "high", label: "300 ppi" },
    { value: "medium", label: "150 ppi" },
    { value: "low", label: "72 ppi" },
  ]

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold">Form primitives gallery</h1>
        <p className="text-sm text-muted-foreground">
          Dev-only. Inventory: see <code className="font-mono">docs/forms-primitives-inventory.md</code>.
        </p>
      </header>

      <Section title="FormField — numeric">
        <Row label="basic / unit / icon">
          <Cell label="basic">
            <FormField variant="numeric" label="N" labelVisuallyHidden value={num} onCommit={setNum} />
          </Cell>
          <Cell label="with unit">
            <FormField variant="numeric" label="N" labelVisuallyHidden unit="mm" value={num} onCommit={setNum} />
          </Cell>
          <Cell label="iconStart + unit">
            <FormField
              variant="numeric"
              label="N"
              labelVisuallyHidden
              iconStart={<Ruler aria-hidden="true" strokeWidth={1} />}
              unit="px"
              value={num}
              onCommit={setNum}
            />
          </Cell>
        </Row>
        <Row label="modes">
          <Cell label="int">
            <FormField variant="numeric" numericMode="int" label="N" labelVisuallyHidden value={num} onCommit={setNum} />
          </Cell>
          <Cell label="decimal (default)">
            <FormField variant="numeric" label="N" labelVisuallyHidden value={num} onCommit={setNum} />
          </Cell>
          <Cell label="signedDecimal + unit">
            <FormField
              variant="numeric"
              numericMode="signedDecimal"
              label="N"
              labelVisuallyHidden
              unit="pt"
              value="-12.5"
              onCommit={noop}
            />
          </Cell>
        </Row>
        <Row label="states">
          <Cell label="default">
            <FormField variant="numeric" label="N" labelVisuallyHidden unit="mm" value={num} onCommit={setNum} />
          </Cell>
          <Cell label="disabled">
            <FormField variant="numeric" label="N" labelVisuallyHidden unit="mm" value={num} onCommit={setNum} disabled />
          </Cell>
          <Cell label="long value (overflow)">
            <FormField
              variant="numeric"
              label="N"
              labelVisuallyHidden
              unit="mm"
              value="123456.789"
              onCommit={noop}
            />
          </Cell>
        </Row>
        <Row label="iconStart variations">
          <Cell label="Hash">
            <FormField
              variant="numeric"
              label="N"
              labelVisuallyHidden
              iconStart={<Hash aria-hidden="true" strokeWidth={1} />}
              value={num}
              onCommit={setNum}
            />
          </Cell>
          <Cell label="Percent + unit">
            <FormField
              variant="numeric"
              label="N"
              labelVisuallyHidden
              iconStart={<Percent aria-hidden="true" strokeWidth={1} />}
              unit="%"
              value="42"
              onCommit={noop}
            />
          </Cell>
          <Cell label="Ruler + unit">
            <FormField
              variant="numeric"
              label="N"
              labelVisuallyHidden
              iconStart={<Ruler aria-hidden="true" strokeWidth={1} />}
              unit="cm"
              value={num}
              onCommit={setNum}
            />
          </Cell>
        </Row>
      </Section>

      <Section title="FormField — text">
        <Row label="basic / disabled / description">
          <Cell label="basic">
            <FormField variant="text" label="T" labelVisuallyHidden value={text} onCommit={setText} />
          </Cell>
          <Cell label="disabled">
            <FormField variant="text" label="T" labelVisuallyHidden value={text} onCommit={setText} disabled />
          </Cell>
          <Cell label="with description">
            <FormField
              variant="text"
              label="Project name"
              value={text}
              onCommit={setText}
              description="Visible to collaborators"
            />
          </Cell>
        </Row>
      </Section>

      <Section title="FormField — color">
        <Row label="states">
          <Cell label="default">
            <FormField variant="color" label="C" labelVisuallyHidden value={color} onCommit={setColor} />
          </Cell>
          <Cell label="disabled">
            <FormField variant="color" label="C" labelVisuallyHidden value={color} onCommit={setColor} disabled />
          </Cell>
          <Cell label="bright fill">
            <FormField variant="color" label="C" labelVisuallyHidden value="#10B981" onCommit={noop} />
          </Cell>
        </Row>
      </Section>

      <Section title="FormField — select">
        <Row label="states">
          <Cell label="default">
            <FormField variant="select" label="S" labelVisuallyHidden value={select} onCommit={setSelect} options={selectOptions} />
          </Cell>
          <Cell label="disabled">
            <FormField variant="select" label="S" labelVisuallyHidden value={select} onCommit={setSelect} options={selectOptions} disabled />
          </Cell>
          <Cell label="long label">
            <FormField
              variant="select"
              label="S"
              labelVisuallyHidden
              value={select}
              onCommit={setSelect}
              options={[
                { value: "high", label: "Some long preset name (high)" },
                { value: "medium", label: "Medium-quality preset" },
                { value: "low", label: "Lo-fi preset" },
              ]}
            />
          </Cell>
        </Row>
      </Section>

      <Section title="AppButton — variants × sizes">
        <Row label="variants (size=default)">
          <Cell label="default">
            <AppButton>Primary</AppButton>
          </Cell>
          <Cell label="outline">
            <AppButton variant="outline">Outline</AppButton>
          </Cell>
          <Cell label="ghost">
            <AppButton variant="ghost">Ghost</AppButton>
          </Cell>
        </Row>
        <Row label="more variants">
          <Cell label="destructive">
            <AppButton variant="destructive">Destructive</AppButton>
          </Cell>
          <Cell label="ghost (sm)">
            <AppButton variant="ghost" size="sm">
              Ghost sm
            </AppButton>
          </Cell>
          <Cell label="secondary">
            <AppButton variant="secondary">Secondary</AppButton>
          </Cell>
        </Row>
        <Row label="states">
          <Cell label="disabled">
            <AppButton disabled>Disabled</AppButton>
          </Cell>
          <Cell label="outline disabled">
            <AppButton variant="outline" disabled>
              Disabled
            </AppButton>
          </Cell>
          <Cell label="destructive disabled">
            <AppButton variant="destructive" disabled>
              Disabled
            </AppButton>
          </Cell>
        </Row>
      </Section>

      <Section title="Bare AppInput / AppSelect (without FormField)">
        <Row label="">
          <Cell label="AppInput">
            <AppInput defaultValue="bare input" />
          </Cell>
          <Cell label="AppInput in FieldGroup with addon">
            <AppFieldGroup>
              <AppFieldGroupAddon align="inline-start" aria-hidden="true">
                <Hash strokeWidth={1} />
              </AppFieldGroupAddon>
              <AppInput defaultValue="grouped" className="rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0" />
            </AppFieldGroup>
          </Cell>
          <Cell label="AppSelect (standalone trigger)">
            <AppSelect value={select} onValueChange={setSelect}>
              <AppSelectTrigger>
                <AppSelectValue />
              </AppSelectTrigger>
              <AppSelectContent>
                {selectOptions.map((o) => (
                  <AppSelectItem key={o.value} value={o.value}>
                    {o.label}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </AppSelect>
          </Cell>
        </Row>
      </Section>

      <Section title="Resizing test bench">
        <p className="text-xs text-muted-foreground">
          Drag this section narrower (or your viewport) to surface the
          numeric-input + unit-addon gap behaviour.
        </p>
        <Row label="narrow row">
          <Cell label="numeric + mm">
            <FormField variant="numeric" label="N" labelVisuallyHidden unit="mm" value="595.28" onCommit={noop} />
          </Cell>
          <Cell label="numeric + ppi">
            <FormField variant="numeric" label="N" labelVisuallyHidden unit="ppi" value="300" onCommit={noop} />
          </Cell>
          <Cell label="numeric + percent">
            <FormField variant="numeric" label="N" labelVisuallyHidden unit="%" value="100" onCommit={noop} />
          </Cell>
        </Row>
      </Section>
    </main>
  )
}
