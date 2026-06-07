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
    for (const key of Object.keys(py)) {
      expect(ts[key as keyof typeof ts]).toEqual(py[key])
    }
  })

  it("PixelateRequest — TS user-facing fields are the expected set", () => {
    // Pixelate's TS schema and the Pydantic request are mostly disjoint: TS
    // holds the user-facing inputs while Python takes the server-computed
    // ones (cells_x/_y, crop_*, stroke_width-hardcoded, palette_*). The two
    // exceptions are the texture fields, which the user picks in TS and the
    // server forwards verbatim — they appear on both sides intentionally.
    // num_colors is now a real TS field (caps the post-snap chip count;
    // forwarded to Python which honours it as a top-N reduction).
    const ts = pixelateSchema.parse({})
    expect(Object.keys(ts).sort()).toEqual([
      "color_mode",
      "distance_metric",
      "dither_mode",
      "dither_pattern_size",
      "num_colors",
      "pre_snap_chroma_scale",
      "supercell_height_mm",
      "supercell_width_mm",
      "texture_enabled",
      "texture_strength",
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

  it("PixelateRequest — dither defaults agree TS ⇄ Python (PR-G flip)", () => {
    // PR-G flipped both defaults from "none" → "knoll_yliluoma" after
    // smoke validation. This parity assertion guards against a one-
    // sided revert: if either side regresses to "none" while the
    // other stays at the flip, the trace output diverges between
    // preview (Vercel) and apply (filter-service). Same constraint
    // pins `dither_pattern_size` so the KY candidate count stays
    // identical too.
    const py = extractPydanticDefaults("PixelateRequest")
    const ts = pixelateSchema.parse({})
    expect(py.dither_mode).toBe("knoll_yliluoma")
    expect(ts.dither_mode).toBe("knoll_yliluoma")
    expect(py.dither_pattern_size).toBe(4)
    expect(ts.dither_pattern_size).toBe(4)
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

  it("PixelateRequest — texture_enabled default agrees TS ⇄ Python", () => {
    // The `texture_enabled` gate must default to the same falsy value on
    // both sides so a missing field on the wire results in a no-op texture
    // step on either deploy half during a rolling release.
    const py = extractPydanticDefaults("PixelateRequest")
    const ts = pixelateSchema.parse({})
    expect(py.texture_enabled).toBe(false)
    expect(ts.texture_enabled).toBe(false)
  })

  it("extracts the expected fields (regression guard for parser)", () => {
    expect(Object.keys(extractPydanticDefaults("LineArtRequest"))).toEqual(
      expect.arrayContaining(["line_thickness", "blur_amount", "smoothness", "num_colors"]),
    )
    expect(Object.keys(extractPydanticDefaults("PixelateRequest"))).toContain("num_colors")
  })
})
