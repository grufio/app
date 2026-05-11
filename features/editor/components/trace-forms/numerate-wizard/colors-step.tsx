import { Checkbox } from "@/components/ui/checkbox"
import { FormField } from "@/components/ui/form-controls"
import { Label } from "@/components/ui/label"
import type { NumerateParams } from "@/lib/editor/trace/numerate"

export function ColorsStep(props: {
  draft: NumerateParams
  setField: <K extends keyof NumerateParams>(key: K, value: NumerateParams[K]) => void
  busy: boolean
}) {
  const { draft, setField, busy } = props
  return (
    <div className="flex flex-col gap-5">
      <FormField
        variant="numeric"
        numericMode="int"
        label="Number of Colors"
        id="num_colors"
        value={String(draft.num_colors)}
        onCommit={(raw) => {
          const n = Number(raw)
          if (Number.isFinite(n)) setField("num_colors", n)
        }}
        onDraftChange={(raw) => {
          const n = Number(raw)
          if (Number.isFinite(n)) setField("num_colors", n)
        }}
        disabled={busy}
        inputProps={{ min: 2, max: 256 }}
        description="Palette size (2-256). Fewer colors merge more cells into the same region."
      />
      <FormField
        variant="numeric"
        numericMode="decimal"
        label="Vector Line Width (px)"
        id="stroke_width"
        value={String(draft.stroke_width)}
        onCommit={(raw) => {
          const n = Number(raw)
          if (Number.isFinite(n)) setField("stroke_width", n)
        }}
        onDraftChange={(raw) => {
          const n = Number(raw)
          if (Number.isFinite(n)) setField("stroke_width", n)
        }}
        disabled={busy}
        inputProps={{ min: 0.1, max: 20, step: 0.1 }}
      />
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Checkbox
            id="show_colors"
            checked={draft.show_colors === true}
            onCheckedChange={(c) => setField("show_colors", c === true)}
            disabled={busy}
          />
          <Label htmlFor="show_colors" className="cursor-pointer font-normal">
            Show Colors
          </Label>
        </div>
      </div>
    </div>
  )
}
