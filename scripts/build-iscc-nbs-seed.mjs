/**
 * Generate the migration that adds `iscc_nbs_name` to `lab_munsell` and
 * `lab_grays` and seeds it by mapping each chip's Munsell HVC
 * coordinates to the corresponding ISCC-NBS Level-3 block name.
 *
 * Sources:
 *  - `color-lab/source/iscc-nbs.xml` — bstreiff/iscc-nbs-colors,
 *    CC0-1.0, transcribed from NBS Special Publication 440 (Kelly &
 *    Judd, "Color: Universal Language and Dictionary of Names").
 *    Fetch with:
 *      mkdir -p color-lab/source && \
 *      curl -sL https://raw.githubusercontent.com/bstreiff/iscc-nbs-colors/master/iscc-nbs.xml \
 *        > color-lab/source/iscc-nbs.xml
 *  - `color-lab/output/palette-colors.json` — 128 Munsell chromatic
 *    chips.
 *  - `color-lab/output/palette-grey.json` — 48 N-axis gray chips.
 *
 * Note: `color-lab/` is gitignored; the script's inputs are
 * local-only by design (mirrors `build-lab-munsell-seed.mjs` /
 * `build-lab-grays-seed.mjs`). The script's OUTPUT — the generated
 * migration SQL — is what gets committed.
 *
 * The ISCC-NBS system divides Munsell color space into 267 named
 * blocks. Each block is one or more rectangular regions in
 * (hue-range × value-range × chroma-range). Hue is treated on a
 * 0-100 circle (R=0, YR=10, Y=20, GY=30, G=40, BG=50, B=60, PB=70,
 * P=80, RP=90), matching `lab_munsell.hue_pct`.
 *
 * Lookup is exact, not nearest-centroid: a chip falls into a block
 * iff its hue ∈ [hue-begin, hue-end), value ∈ [value-begin,
 * value-end), and chroma ∈ [chroma-begin, chroma-end). One range
 * wraps the circle (9RP → 1R); chips there get shifted by +100.
 *
 * Run with:
 *   node scripts/build-iscc-nbs-seed.mjs <output-sql-path>
 *
 * If the output path is omitted, prints to stdout.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, "..")
const XML_PATH = resolve(REPO_ROOT, "color-lab/source/iscc-nbs.xml")
const COLORS_JSON = resolve(REPO_ROOT, "color-lab/output/palette-colors.json")
const GRAYS_JSON = resolve(REPO_ROOT, "color-lab/output/palette-grey.json")

const HUE_FAMILY_BASE = { R: 0, YR: 10, Y: 20, GY: 30, G: 40, BG: 50, B: 60, PB: 70, P: 80, RP: 90 }

function parseMunsellHue(s) {
  const m = s.match(/^([\d.]+)([A-Z]{1,2})$/)
  if (!m) throw new Error(`Cannot parse Munsell hue: ${s}`)
  const pct = parseFloat(m[1])
  const family = m[2]
  const base = HUE_FAMILY_BASE[family]
  if (base === undefined) throw new Error(`Unknown hue family in ${s}: ${family}`)
  return base + pct
}

function parseLevel3Names(xml) {
  const names = new Map()
  const re = /<name color="(\d+)" name="([^"]+)" abbr="[^"]+"\s*\/>/g
  let m
  while ((m = re.exec(xml)) !== null) {
    const id = parseInt(m[1], 10)
    if (id >= 1 && id <= 267) names.set(id, m[2])
  }
  if (names.size !== 267) throw new Error(`Expected 267 ISCC-NBS Level-3 names, got ${names.size}`)
  return names
}

function parseHueRanges(xml) {
  const out = []
  const reRange = /<hue-range begin="([^"]+)" end="([^"]+)">([\s\S]*?)<\/hue-range>/g
  const reBlock = /<range color="(\d+)" chroma-begin="([\d.]+)" chroma-end="([\d.]+|INF)" value-begin="([\d.]+)" value-end="([\d.]+|INF)"\s*\/>/g
  let m
  while ((m = reRange.exec(xml)) !== null) {
    const begin = parseMunsellHue(m[1])
    let end = parseMunsellHue(m[2])
    if (end <= begin) end += 100
    const blocks = []
    let b
    while ((b = reBlock.exec(m[3])) !== null) {
      blocks.push({
        colorId: parseInt(b[1], 10),
        chromaBegin: parseFloat(b[2]),
        chromaEnd: b[3] === "INF" ? Infinity : parseFloat(b[3]),
        valueBegin: parseFloat(b[4]),
        valueEnd: b[5] === "INF" ? Infinity : parseFloat(b[5]),
      })
    }
    out.push({ begin, end, blocks })
  }
  if (out.length === 0) throw new Error("Parsed 0 hue-ranges from XML — regex mismatch?")
  return out
}

function lookupColorId(hue, value, chroma, hueRanges) {
  for (const hr of hueRanges) {
    let h = hue
    if (hr.end > 100 && hue < hr.end - 100) h = hue + 100
    if (h < hr.begin || h >= hr.end) continue
    for (const b of hr.blocks) {
      if (chroma >= b.chromaBegin && chroma < b.chromaEnd && value >= b.valueBegin && value < b.valueEnd) {
        return b.colorId
      }
    }
  }
  return null
}

function chipHueFromNotation(notation) {
  const m = notation.match(/^\s*([\d.]+[A-Z]{1,2})\s/)
  if (!m) throw new Error(`Cannot parse hue from notation: ${notation}`)
  return parseMunsellHue(m[1])
}

function sqlQuote(s) {
  return `'${String(s).replace(/'/g, "''")}'`
}

function buildMigration(colorAssignments, grayAssignments) {
  const lines = []
  lines.push("-- @intent-data-migration")
  lines.push("--")
  lines.push("-- Add iscc_nbs_name to lab_munsell + lab_grays, seeded by mapping")
  lines.push("-- each chip's Munsell HVC coordinates to the corresponding")
  lines.push("-- ISCC-NBS Level-3 block name (267 named regions in Munsell color")
  lines.push("-- space — NBS Special Publication 440, Kelly & Judd).")
  lines.push("--")
  lines.push("-- Source data: color-lab/source/iscc-nbs.xml (CC0-1.0). Generated")
  lines.push("-- by scripts/build-iscc-nbs-seed.mjs — do not hand-edit; re-run")
  lines.push("-- the loader to regenerate.")
  lines.push("")
  lines.push('ALTER TABLE "public"."lab_munsell" ADD COLUMN IF NOT EXISTS "iscc_nbs_name" text;')
  lines.push('ALTER TABLE "public"."lab_grays"    ADD COLUMN IF NOT EXISTS "iscc_nbs_name" text;')
  lines.push("")
  lines.push("-- Per-chip UPDATEs (idempotent; matched by unique notation).")
  for (const { notation, name } of colorAssignments) {
    lines.push(
      `UPDATE "public"."lab_munsell" SET "iscc_nbs_name" = ${sqlQuote(name)} WHERE "notation" = ${sqlQuote(notation)};`,
    )
  }
  for (const { notation, name } of grayAssignments) {
    lines.push(
      `UPDATE "public"."lab_grays"   SET "iscc_nbs_name" = ${sqlQuote(name)} WHERE "notation" = ${sqlQuote(notation)};`,
    )
  }
  lines.push("")
  return lines.join("\n")
}

function main() {
  const outputPath = process.argv[2]
  const xml = readFileSync(XML_PATH, "utf8")
  const colors = JSON.parse(readFileSync(COLORS_JSON, "utf8"))
  const grays = JSON.parse(readFileSync(GRAYS_JSON, "utf8"))

  const namesById = parseLevel3Names(xml)
  const hueRanges = parseHueRanges(xml)

  const colorAssignments = colors.map((c) => {
    const hue = chipHueFromNotation(c.munsell)
    const id = lookupColorId(hue, c.value, c.chroma, hueRanges)
    return { notation: c.munsell, name: id ? namesById.get(id) : null }
  })

  const neutralBlocks = hueRanges[0].blocks.filter((b) => b.colorId >= 263 && b.colorId <= 267)
  if (neutralBlocks.length !== 5) {
    throw new Error(`Expected 5 neutral blocks in the first hue-range, got ${neutralBlocks.length}`)
  }
  const grayAssignments = grays.map((g) => {
    const block = neutralBlocks.find((b) => g.value >= b.valueBegin && g.value < b.valueEnd)
    return { notation: g.munsell, name: block ? namesById.get(block.colorId) : null }
  })

  const namedColors = colorAssignments.filter((a) => a.name)
  const namedGrays = grayAssignments.filter((a) => a.name)
  console.error(`color chips: ${colors.length} named / ${colors.length - namedColors.length} unnamed`)
  console.error(`gray chips:  ${grays.length} named / ${grays.length - namedGrays.length} unnamed`)
  if (colors.length - namedColors.length > 0) {
    console.error("unnamed color chips (will stay NULL):")
    for (const a of colorAssignments.filter((a) => !a.name)) console.error("  " + a.notation)
  }
  if (grays.length - namedGrays.length > 0) {
    console.error("unnamed gray chips (will stay NULL):")
    for (const a of grayAssignments.filter((a) => !a.name)) console.error("  " + a.notation)
  }

  const sql = buildMigration(namedColors, namedGrays)
  if (outputPath) {
    writeFileSync(outputPath, sql, "utf8")
    console.error(`wrote migration to ${outputPath}`)
  } else {
    process.stdout.write(sql)
  }
}

main()
