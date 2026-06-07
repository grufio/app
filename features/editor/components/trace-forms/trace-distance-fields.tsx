"use client"

/**
 * Shared "Distance" segment for trace dialogs (Pixelate + Circulate) — PR-H.
 *
 * Single select for the snap-step distance metric:
 *   - "Standard (OKLab)"        → `distance_metric = "oklab"` (default,
 *                                  pre-PR-H semantics)
 *   - "Perzeptuell (CIEDE 2000)" → `distance_metric = "ciede2000"`
 *
 * Only the plain snap path (`dither_mode === "none"`) and the post-snap
 * top-N re-snap honour the metric. KY + FS dithering use OKLab squared-
 * Euclidean argmin internally regardless — documented inline so users
 * don't expect a dramatic visual delta when dithering is on. See
 * `lib/editor/trace/distance-metric-schema.ts` for the full contract.
 *
 * Both forms wrap this in `<EditorSidebarSection title="Distance">`.
 *
 * Stateless — parent owns the draft and reacts to `onMetricChange`.
 */
import { Ruler } from "lucide-react"

import { FormField, type SelectFieldOption } from "@/components/ui/form-controls"
import {
  DISTANCE_METRICS,
  type DistanceMetric,
} from "@/lib/editor/trace/distance-metric-schema"

import { PanelIconSlot, PanelTwoFieldRow } from "../panel-layout"

const METRIC_OPTIONS: SelectFieldOption[] = [
  { value: "oklab", label: "Standard (OKLab)" },
  { value: "ciede2000", label: "Perzeptuell (CIEDE 2000)" },
]

// Compile-time sanity: keep the option order aligned with the schema.
void (DISTANCE_METRICS satisfies ReadonlyArray<DistanceMetric>)

export function TraceDistanceFields(props: {
  metric: DistanceMetric
  onMetricChange: (value: DistanceMetric) => void
  disabled?: boolean
}) {
  const { metric, onMetricChange, disabled } = props
  return (
    <PanelTwoFieldRow>
      <div className="col-span-2">
        <FormField
          variant="select"
          label="Distance metric"
          labelVisuallyHidden
          iconStart={<Ruler aria-hidden="true" />}
          id="distance_metric"
          value={metric}
          options={METRIC_OPTIONS}
          onCommit={(v) => onMetricChange(v as DistanceMetric)}
          disabled={disabled}
        />
      </div>
      <PanelIconSlot />
    </PanelTwoFieldRow>
  )
}
