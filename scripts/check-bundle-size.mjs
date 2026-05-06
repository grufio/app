/**
 * Build-artifact size guard.
 *
 * Walks `.next/static/chunks/**\/*.js` after a `next build` and asserts the
 * total JS size stays under the configured budget. Catches schleichende
 * Bundle-Bloat (a vendor dep doubles, an `import "*"` slips in) before it
 * lands on production users.
 *
 * Why a hand-rolled walker instead of @next/bundle-analyzer? Cheaper:
 * no extra build pass, no HTML report to parse, and it runs in <100ms in CI.
 * If the per-route detail ever becomes interesting, swap to bundle-analyzer.
 *
 * Configuration:
 *   BUNDLE_SIZE_BUDGET_KB — override the budget for one run (e.g. when
 *   investigating). Default: 2500 KB.
 */
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const chunksDir = path.join(root, ".next", "static", "chunks")
const DEFAULT_BUDGET_KB = 2500

if (!fs.existsSync(chunksDir)) {
  console.error(`[check-bundle-size] No .next/static/chunks directory. Run \`npm run build\` first.`)
  process.exit(1)
}

const budgetKb = Number(process.env.BUNDLE_SIZE_BUDGET_KB ?? DEFAULT_BUDGET_KB)
if (!Number.isFinite(budgetKb) || budgetKb <= 0) {
  console.error(`[check-bundle-size] Invalid BUNDLE_SIZE_BUDGET_KB=${process.env.BUNDLE_SIZE_BUDGET_KB}`)
  process.exit(1)
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(p)
    else if (entry.isFile() && entry.name.endsWith(".js")) yield p
  }
}

let totalBytes = 0
const top = []
for (const file of walk(chunksDir)) {
  const size = fs.statSync(file).size
  totalBytes += size
  top.push({ file: path.relative(chunksDir, file), size })
}
top.sort((a, b) => b.size - a.size)

const totalKb = totalBytes / 1024
const overBudget = totalKb > budgetKb

const fmt = (kb) => `${kb.toFixed(1)} KB`
console.log(`[check-bundle-size] Total JS in .next/static/chunks: ${fmt(totalKb)} (budget ${fmt(budgetKb)})`)

if (overBudget) {
  console.error("\n[check-bundle-size] OVER BUDGET")
  console.error("\nTop 10 files by size:")
  for (const entry of top.slice(0, 10)) {
    console.error(`  ${fmt(entry.size / 1024).padStart(10)}  ${entry.file}`)
  }
  console.error(`\nFix: investigate the top entries (likely a new dep import or a server-only module pulled into a client bundle).`)
  console.error(`Override (one run): BUNDLE_SIZE_BUDGET_KB=<higher> npm run check:bundle-size`)
  process.exit(1)
}

console.log(`OK: bundle within budget (${fmt(budgetKb - totalKb)} headroom).`)
