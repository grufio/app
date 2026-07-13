/**
 * Parity test: TypeScript trace registry defaults must match the
 * Pydantic defaults declared in `filter-service/app/main.py`.
 *
 * Sister to `lib/editor/filters/python-parity.test.ts` — split so
 * filter and trace each enforce their own contract against the
 * Python service.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { lineartSchema } from "./lineart"
import { linerateSchema } from "./linerate"
import { smoothnessToParams } from "./contour-trace"
import { flattenToLam } from "./l0-smooth"
import {
  LINERATE_DETAIL_MAX_FRAC,
  LINERATE_DETAIL_MIN_FRAC,
  detailToMinArea,
} from "./linerate-preview"
import { pixelateSchema } from "./pixelate"

const PYTHON_PATH = join(__dirname, "../../../filter-service/app/main.py")
const PYTHON_SOURCE = readFileSync(PYTHON_PATH, "utf-8")

function parsePythonLiteral(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed === "True") return true
  if (trimmed === "False") return false
  if (trimmed === "None") return null
  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10)
  if (/^-?\d*\.\d+$/.test(trimmed)) return Number.parseFloat(trimmed)
  const stringMatch = /^["'](.*?)["']$/.exec(trimmed)
  if (stringMatch) return stringMatch[1]
  throw new Error(`Cannot parse Python literal: ${raw}`)
}

function extractPydanticDefaults(className: string): Record<string, unknown> {
  const classRe = new RegExp(`class\\s+${className}\\s*\\(BaseModel\\):([\\s\\S]*?)(?:\\n\\n|\\nclass\\s|\\n@)`)
  const classMatch = classRe.exec(PYTHON_SOURCE)
  if (!classMatch) {
    throw new Error(`Class ${className} not found in ${PYTHON_PATH}`)
  }
  const body = classMatch[1]
  const fieldRe = /^\s+([a-z_][a-z0-9_]*)\s*:\s*(?:[A-Za-z][A-Za-z0-9_]*(?:\[[^\]]*\])?)\s*=\s*(.+?)$/gim
  const defaults: Record<string, unknown> = {}
  let match: RegExpExecArray | null
  while ((match = fieldRe.exec(body)) !== null) {
    const [, name, rawValue] = match
    defaults[name] = parsePythonLiteral(rawValue)
  }
  return defaults
}

describe("Python parity: TS trace schema defaults vs Pydantic", () => {
  it("LineArtRequest", () => {
    const py = extractPydanticDefaults("LineArtRequest")
    const ts = lineartSchema.parse({})
    // Server-computed fields the Node bridge derives rather than passing a TS
    // param through 1:1 (like Pixelate's cells_x/crop_*). `min_region_radius_px`
    // is computed from the TS `min_paintable_mm` dial + the content rect's
    // px/mm scale + the line width (services/editor/server/trace/lineart.ts),
    // so it has no matching TS default — exclude it from the pass-through check.
    const SERVER_COMPUTED = new Set(["min_region_radius_px"])
    for (const key of Object.keys(py)) {
      if (SERVER_COMPUTED.has(key)) continue
      expect(ts[key as keyof typeof ts]).toEqual(py[key])
    }
  })

  it("LinerateRequest", () => {
    const py = extractPydanticDefaults("LinerateRequest")
    const ts = linerateSchema.parse({})
    // Server-computed / bridge-derived fields, not 1:1 TS pass-throughs:
    // `min_region_radius_px` ← `min_paintable_mm` dial; `work_edge` ← the
    // `resolution` dial (low/medium/high → 640/720/960 in the Node bridge).
    const SERVER_COMPUTED = new Set(["min_region_radius_px", "work_edge"])
    for (const key of Object.keys(py)) {
      if (SERVER_COMPUTED.has(key)) continue
      expect(ts[key as keyof typeof ts]).toEqual(py[key])
    }
  })

  it("PixelateRequest — TS user-facing fields are the expected set", () => {
    // Pixelate's TS schema and the Pydantic request are mostly disjoint: TS
    // holds the user-facing inputs while Python takes the server-computed
    // ones (cells_x/_y, crop_*, stroke_width-hardcoded, palette_*). Dither
    // (mode + strength) appears on both sides — TS picks, Python consumes.
    // num_colors is a real TS field (caps the post-snap chip count;
    // forwarded to Python which honours it as a top-N reduction).
    const ts = pixelateSchema.parse({})
    expect(Object.keys(ts).sort()).toEqual([
      "color_mode",
      "distance_metric",
      "dither_mode",
      "dither_strength",
      "num_colors",
      "palette_restriction",
      "pre_snap_chroma_scale",
      "supercell_height_mm",
      "supercell_width_mm",
    ])
  })

  it("PixelateRequest — pre_snap_chroma_scale defaults agree TS ⇄ Python at 1.0", () => {
    // The schema field is kept for backward-compat parsing of persisted
    // trace rows that carry a non-default value; both sides default to
    // 1.0 (= no-op boost) so a missing field on the wire renders byte-
    // identical to the pre-feature pipeline on either deploy half.
    const py = extractPydanticDefaults("PixelateRequest")
    const ts = pixelateSchema.parse({})
    expect(py.pre_snap_chroma_scale).toBe(1)
    expect(ts.pre_snap_chroma_scale).toBe(1)
  })

  it("PixelateRequest — dither defaults agree TS ⇄ Python", () => {
    // PR-G flipped both defaults from "none" → "knoll_yliluoma" after
    // smoke validation. This parity assertion guards against a one-
    // sided revert: if either side regresses to "none" while the
    // other stays at the flip, the trace output diverges between
    // preview (Vercel) and apply (filter-service). Same constraint
    // pins `dither_strength` so the KY candidate count stays identical
    // (default 0.5 → N=4 via `_strength_to_ky_n`).
    const py = extractPydanticDefaults("PixelateRequest")
    const ts = pixelateSchema.parse({})
    expect(py.dither_mode).toBe("knoll_yliluoma")
    expect(ts.dither_mode).toBe("knoll_yliluoma")
    expect(py.dither_strength).toBe(0.5)
    expect(ts.dither_strength).toBe(0.5)
  })

  it("PixelateRequest — distance_metric defaults agree TS ⇄ Python at 'oklab' (PR-H)", () => {
    // Both halves of the rolling deploy default to "oklab" so a
    // request that omits the field renders byte-identically to the
    // pre-PR-H pipeline. The Vercel-side default doubles as the form
    // default; persisted rows without the field parse to "oklab" on
    // both server bridges. Parity is the gate: a future PR that
    // flips the default on one side only would diverge preview ⇄
    // apply output but fail this assertion first.
    const py = extractPydanticDefaults("PixelateRequest")
    const ts = pixelateSchema.parse({})
    expect(py.distance_metric).toBe("oklab")
    expect(ts.distance_metric).toBe("oklab")
  })

  it("PixelateRequest — palette_restriction defaults agree TS ⇄ Python at 'top_n' (PR-I)", () => {
    // Same one-sided-flip guard as the metric: PR-I added the strategy
    // switch with `"top_n"` (legacy count-based) as the default on both
    // sides. A future revert that flips only one half would diverge
    // preview ⇄ apply output AND silently shift `palette_indices_used`
    // (PAM emits original-palette indices via the kept-index translation;
    // top_n keeps them in original space implicitly).
    const py = extractPydanticDefaults("PixelateRequest")
    const ts = pixelateSchema.parse({})
    expect(py.palette_restriction).toBe("top_n")
    expect(ts.palette_restriction).toBe("top_n")
  })

  it("extracts the expected fields (regression guard for parser)", () => {
    expect(Object.keys(extractPydanticDefaults("LineArtRequest"))).toEqual(
      expect.arrayContaining(["line_thickness", "blur_amount", "smoothness", "num_colors"]),
    )
    expect(Object.keys(extractPydanticDefaults("PixelateRequest"))).toContain("num_colors")
  })
})

// The linerate PREVIEW ports the server's `detail`→facet-min-area mapping so the
// dialog's Detail slider shows an approximate region count. The port must stay in
// lockstep with the Python source: if a server-side PR changes the constants or the
// interpolation shape, this fails the client build (not silently diverge).
describe("Python parity: linerate detail→min-area preview port", () => {
  const LINERATE_PATH = join(__dirname, "../../../filter-service/app/linerate.py")
  const LINERATE_SOURCE = readFileSync(LINERATE_PATH, "utf-8")

  const readConst = (name: string): number => {
    const m = new RegExp(`${name}\\s*=\\s*([0-9.]+)`).exec(LINERATE_SOURCE)
    if (!m) throw new Error(`${name} not found in ${LINERATE_PATH}`)
    return Number.parseFloat(m[1])
  }

  it("constants match the TS port", () => {
    expect(readConst("_DETAIL_MIN_FRAC")).toBe(LINERATE_DETAIL_MIN_FRAC)
    expect(readConst("_DETAIL_MAX_FRAC")).toBe(LINERATE_DETAIL_MAX_FRAC)
  })

  it("interpolation is GEOMETRIC on both sides", () => {
    // Server: frac = _DETAIL_MAX_FRAC * (_DETAIL_MIN_FRAC / _DETAIL_MAX_FRAC) ** d
    expect(LINERATE_SOURCE).toMatch(
      /frac\s*=\s*_DETAIL_MAX_FRAC\s*\*\s*\(_DETAIL_MIN_FRAC\s*\/\s*_DETAIL_MAX_FRAC\)\s*\*\*\s*d/,
    )
    // TS mirrors it: at the endpoints min-area = frac_max·px (d=0) and frac_min·px (d=1).
    const px = 1_000_000
    expect(detailToMinArea(0, px, 0)).toBeCloseTo(LINERATE_DETAIL_MAX_FRAC * px, 3)
    expect(detailToMinArea(1, px, 0)).toBeCloseTo(LINERATE_DETAIL_MIN_FRAC * px, 3)
  })

  it("L0 flatten mapping + β schedule match the client port", () => {
    // The preview's client L0 (`l0-smooth.ts`) must track the server `_l0_smooth`
    // / `_flatten_to_lam`. Parse the server constants and assert the TS port agrees.
    const lamMatch = /return\s+0\.002\s*\+\s*f\s*\*\s*0\.045/.exec(LINERATE_SOURCE)
    expect(lamMatch, "server _flatten_to_lam formula changed").not.toBeNull()
    expect(flattenToLam(0)).toBeCloseTo(0.002, 9)
    expect(flattenToLam(1)).toBeCloseTo(0.047, 9)
    // β schedule: start 2·lam, ×kappa=2.0, stop at 1e5 (kept in sync in l0-smooth.ts).
    expect(LINERATE_SOURCE).toMatch(/beta\s*=\s*2\s*\*\s*lam/)
    expect(LINERATE_SOURCE).toMatch(/kappa:\s*float\s*=\s*2\.0/)
    expect(LINERATE_SOURCE).toMatch(/while\s+beta\s*<\s*1e5/)
  })

  it("smoothness→(eps,iters) mapping matches the client port", () => {
    // The preview outlines use the same smoothness_to_params the server applies
    // to its arcs, so preview ⇄ Apply smoothing stays consistent.
    expect(LINERATE_SOURCE).toMatch(/return\s+0\.5\s*\+\s*s\s*\*\s*2\.0\s*,\s*2\s*\+\s*int\(round\(s\s*\*\s*2\)\)/)
    expect(smoothnessToParams(0)).toEqual({ eps: 0.5, iters: 2 })
    expect(smoothnessToParams(1)).toEqual({ eps: 2.5, iters: 4 })
  })

  it("watertight back-half functions the preview ports still exist server-side", () => {
    // boundary-arcs.ts is a client port of these; a server rewrite should flag the
    // port for review (we intentionally do NOT assert stroke parity — the preview
    // strokes internal arcs once + skips the frame, unlike the server face paths).
    expect(LINERATE_SOURCE).toMatch(/def build_arcs\(/)
    expect(LINERATE_SOURCE).toMatch(/def smooth_arc\(/)
    expect(LINERATE_SOURCE).toMatch(/def assemble_faces\(/)
  })
})
