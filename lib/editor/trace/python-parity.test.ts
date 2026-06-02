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
      "num_colors",
      "supercell_height_mm",
      "supercell_width_mm",
      "texture_enabled",
      "texture_strength",
    ])
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
    expect(Object.keys(extractPydanticDefaults("PixelateRequest"))).toContain("stroke_width")
    expect(Object.keys(extractPydanticDefaults("PixelateRequest"))).toContain("num_colors")
  })
})
