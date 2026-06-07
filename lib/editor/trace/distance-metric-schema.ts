/**
 * Shared `distance_metric` schema slice used by both pixelate +
 * circulate traces (PR-H). Picks which colour-space distance the
 * cell-mean → palette-chip snap step uses:
 *
 *   - `"oklab"`     → OKLab squared-Euclidean (Ottosson 2020), the
 *                     pre-PR-H default. Output byte-identical to the
 *                     pipeline before this feature shipped.
 *   - `"ciede2000"` → CIE ΔE00 in CIE Lab D65 (Sharma, Wu & Dalal
 *                     2005). Perceptual gold-standard, explicitly
 *                     corrects mid-L contrast (Sl term) and blue-axis
 *                     hue rotation (Rt term) — both known weaknesses
 *                     of plain Euclidean Lab metrics that OKLab
 *                     inherits.
 *
 * Default `"oklab"` keeps persisted trace rows without this field
 * applying byte-identically to the pre-feature pipeline. Pydantic's
 * default-extra-ignore on `PixelateRequest` / `CirculateRequest` keeps
 * the rolling-deploy story safe in both directions.
 *
 * Scope (intentional limits):
 *   - Only the `dither_mode == "none"` snap path uses the chosen
 *     metric. KY + FS continue to use squared-Euclidean argmin in
 *     palette space (= OKLab) regardless — refactoring them to be
 *     metric-aware is a separate follow-up (see plan).
 *   - `lineart.snap_path_fills_to_palette` (vtracer fill snap) honours
 *     the metric too — Lineart has no UI selector yet, but the wiring
 *     keeps the snap consistent if the request body carries it.
 *   - `pre_snap_chroma_scale` (the OKLCh chroma boost from #400) is
 *     SKIPPED when `distance_metric == "ciede2000"`. The boost is
 *     OKLCh-specific; CIE LCh is a different space, so applying the
 *     boost then converting would be a silent semantic mismatch. The
 *     field default is 1.0 (no-op) since PR-A, so the only impact is
 *     on persisted rows that carry a non-default value — those lose
 *     the boost effect under CIEDE2000, documented in the schema
 *     docstring rather than auto-migrated.
 *
 * Math available via:
 *   - `lib/color/ciede2000.ts` — `rgb255ToCielab`, `ciede2000`,
 *     `nearestPaletteIndexCiede2000`
 *   - `filter-service/app/ciede2000.py` — sister module, same shape
 */
import { z } from "zod"

export const DISTANCE_METRICS = ["oklab", "ciede2000"] as const
export type DistanceMetric = (typeof DISTANCE_METRICS)[number]
export const distanceMetricSchema = z.enum(DISTANCE_METRICS).default("oklab")
