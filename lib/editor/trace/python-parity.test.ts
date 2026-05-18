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
import { numerateSchema } from "./numerate"

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

  it("NumerateRequest — num_colors default agrees", () => {
    // Numerate's TS schema is intentionally narrower than the Pydantic
    // request: TS holds only user-facing inputs (supercell_mm,
    // num_colors), while Python additionally takes server-computed
    // params (cells_x/_y, crop_*, stroke_width-hardcoded). The only
    // user-facing field that both sides agree on is num_colors.
    const py = extractPydanticDefaults("NumerateRequest")
    const ts = numerateSchema.parse({})
    expect(ts.num_colors).toEqual(py.num_colors)
  })

  it("extracts the expected fields (regression guard for parser)", () => {
    // F20 PR2 dropped the Canny-era LineArt fields (threshold1,
    // threshold2, invert, min_contour_area). The new vtracer-based
    // schema has 4 defaults: line_thickness, blur_amount, smoothness,
    // num_colors.
    expect(Object.keys(extractPydanticDefaults("LineArtRequest"))).toEqual(
      expect.arrayContaining(["line_thickness", "blur_amount", "smoothness", "num_colors"]),
    )
    expect(Object.keys(extractPydanticDefaults("NumerateRequest"))).toContain("stroke_width")
    expect(Object.keys(extractPydanticDefaults("NumerateRequest"))).toContain("num_colors")
  })
})
