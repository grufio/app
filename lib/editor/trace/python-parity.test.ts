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

  it("PixelateRequest — TS schema shares no default field with Python", () => {
    // Pixelate's TS schema and the Pydantic request are intentionally
    // disjoint: TS holds the user-facing inputs (supercell_width_mm,
    // supercell_height_mm, color_mode, color_space) while Python takes only
    // server-computed params (cells_x/_y, crop_*, stroke_width-hardcoded,
    // palette_*) plus `num_colors` — kept solely as an ignored back-compat
    // field. So there is no shared user-facing default to drift; the guard
    // is that TS no longer carries num_colors while Python still tolerates
    // it (see the regression guard below).
    const ts = pixelateSchema.parse({})
    expect(ts).not.toHaveProperty("num_colors")
    expect(Object.keys(ts).sort()).toEqual(
      ["color_mode", "color_space", "supercell_height_mm", "supercell_width_mm"],
    )
  })

  it("extracts the expected fields (regression guard for parser)", () => {
    expect(Object.keys(extractPydanticDefaults("LineArtRequest"))).toEqual(
      expect.arrayContaining(["line_thickness", "blur_amount", "smoothness", "num_colors"]),
    )
    expect(Object.keys(extractPydanticDefaults("PixelateRequest"))).toContain("stroke_width")
    // Python keeps num_colors as an ignored back-compat field even though the
    // TS schema dropped it — old in-flight requests must not break.
    expect(Object.keys(extractPydanticDefaults("PixelateRequest"))).toContain("num_colors")
  })
})
