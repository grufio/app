/**
 * Parity test: TypeScript registry defaults must match the Pydantic
 * defaults declared in `filter-service/app/main.py`.
 *
 * Why this test exists: the registry is the single source of truth in TS,
 * but the Python service has its own Pydantic models with their own
 * defaults. Drift between them is exactly the bug class the registry
 * refactor was meant to eliminate. This test guards the boundary.
 *
 * Approach: parse Python source as text (Pydantic class blocks), extract
 * `field: type = literal` declarations, compare against `schema.parse({})`
 * per filter. Fields without a Python default (required fields) are
 * skipped — TS-side defaults for required-on-Python fields are TS-only
 * convenience and not part of the contract.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { lineartSchema } from "./lineart"
import { numerateSchema } from "./numerate"
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
  // Match `field_name: type_with_brackets = literal`
  const fieldRe = /^\s+([a-z_][a-z0-9_]*)\s*:\s*(?:[A-Za-z][A-Za-z0-9_]*(?:\[[^\]]*\])?)\s*=\s*(.+?)$/gim
  const defaults: Record<string, unknown> = {}
  let match: RegExpExecArray | null
  while ((match = fieldRe.exec(body)) !== null) {
    const [, name, rawValue] = match
    defaults[name] = parsePythonLiteral(rawValue)
  }
  return defaults
}

describe("Python parity: TS schema defaults vs Pydantic class defaults", () => {
  it("PixelateRequest", () => {
    const py = extractPydanticDefaults("PixelateRequest")
    const ts = pixelateSchema.parse({})
    for (const key of Object.keys(py)) {
      expect(ts[key as keyof typeof ts]).toEqual(py[key])
    }
  })

  it("LineArtRequest", () => {
    const py = extractPydanticDefaults("LineArtRequest")
    const ts = lineartSchema.parse({})
    for (const key of Object.keys(py)) {
      expect(ts[key as keyof typeof ts]).toEqual(py[key])
    }
  })

  it("NumerateRequest", () => {
    const py = extractPydanticDefaults("NumerateRequest")
    const ts = numerateSchema.parse({})
    for (const key of Object.keys(py)) {
      expect(ts[key as keyof typeof ts]).toEqual(py[key])
    }
  })

  it("extracts the expected number of fields per filter (regression guard for parser)", () => {
    expect(Object.keys(extractPydanticDefaults("PixelateRequest"))).toContain("color_mode")
    expect(Object.keys(extractPydanticDefaults("PixelateRequest"))).toContain("num_colors")
    expect(Object.keys(extractPydanticDefaults("LineArtRequest")).length).toBeGreaterThanOrEqual(7)
    expect(Object.keys(extractPydanticDefaults("NumerateRequest"))).toContain("stroke_width")
    expect(Object.keys(extractPydanticDefaults("NumerateRequest"))).toContain("show_colors")
  })
})
