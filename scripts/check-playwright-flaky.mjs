/**
 * Fail CI when Playwright passes are propped up by retries.
 *
 * Configuration via env vars (all optional; defaults preserve the
 * "fail on any flaky" behaviour the gate has had since 2026):
 *
 *   FLAKY_MAX_COUNT  — Allow up to N flaky tests before the gate fails.
 *                      Default 0 (any flaky test fails the build).
 *   FLAKY_MAX_RATE   — Decimal rate (e.g. "0.05" = 5 %) above which the
 *                      gate fails regardless of count. Default unset.
 *   FLAKY_SOFT_MODE  — When "1" the gate never exits 1; flaky annotations
 *                      and summary still get written. Use during incident
 *                      windows where flake noise must not block merges.
 *
 * Both COUNT and RATE thresholds are evaluated; the gate fails if *either*
 * is exceeded — that way callers can set whichever bound is more
 * meaningful for their suite size without losing the other.
 *
 * Annotations (`::warning::`) are emitted regardless of whether the gate
 * blocks, so reviewers always see flaky results in the PR Checks UI.
 */
import fs from "node:fs"
import path from "node:path"

const reportPath = path.resolve(process.cwd(), "playwright-report/results.json")
const summaryPath = path.resolve(process.cwd(), "playwright-report/flaky-summary.json")
if (!fs.existsSync(reportPath)) {
  console.error(`[check-playwright-flaky] Missing report: ${reportPath}`)
  process.exit(1)
}

function parsePositiveIntEnv(name, fallback) {
  const raw = process.env[name]
  if (raw == null || raw === "") return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    console.error(`[check-playwright-flaky] Invalid ${name}=${raw}; using ${fallback}`)
    return fallback
  }
  return n
}

function parseRateEnv(name) {
  const raw = process.env[name]
  if (raw == null || raw === "") return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    console.error(`[check-playwright-flaky] Invalid ${name}=${raw}; expected 0..1`)
    return null
  }
  return n
}

const maxCount = parsePositiveIntEnv("FLAKY_MAX_COUNT", 0)
const maxRate = parseRateEnv("FLAKY_MAX_RATE")
const softMode = process.env.FLAKY_SOFT_MODE === "1"

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"))
const flakyTitles = []
let totalSpecs = 0

function visitSuite(suite, parent = []) {
  const titlePath = suite.title ? [...parent, suite.title] : parent
  for (const spec of suite.specs ?? []) {
    totalSpecs += 1
    const results = spec.tests?.flatMap((t) => t.results ?? []) ?? []
    const passed = results.some((r) => r.status === "passed")
    const hadRetry = results.some((r) => typeof r.retry === "number" && r.retry > 0 && r.status === "passed")
    if (passed && hadRetry) {
      flakyTitles.push([...titlePath, spec.title].filter(Boolean).join(" > "))
    }
  }
  for (const child of suite.suites ?? []) visitSuite(child, titlePath)
}

for (const suite of report.suites ?? []) visitSuite(suite)

const flakyRate = totalSpecs > 0 ? flakyTitles.length / totalSpecs : 0
const overCount = flakyTitles.length > maxCount
const overRate = maxRate != null && flakyRate > maxRate
const breach = overCount || overRate

const summary = {
  generated_at: new Date().toISOString(),
  total_specs: totalSpecs,
  flaky_count: flakyTitles.length,
  flaky_rate: flakyRate,
  threshold: {
    max_count: maxCount,
    max_rate: maxRate,
    soft_mode: softMode,
  },
  breach: breach
    ? {
        over_count: overCount,
        over_rate: overRate,
      }
    : null,
  flaky_titles: flakyTitles,
}
fs.mkdirSync(path.dirname(summaryPath), { recursive: true })
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))
console.log(`[check-playwright-flaky] Wrote summary: ${summaryPath}`)

// Emit a GitHub-Actions annotation for each flaky test so the PR UI surfaces
// them inline (independent of the hard-fail decision below).
const inGitHubActions = process.env.GITHUB_ACTIONS === "true"
if (inGitHubActions) {
  for (const title of flakyTitles) {
    process.stdout.write(`::warning title=Flaky Playwright test::${title}\n`)
  }
  if (totalSpecs > 0) {
    const pct = (flakyRate * 100).toFixed(2)
    process.stdout.write(`::notice title=Playwright flaky rate::${flakyTitles.length}/${totalSpecs} = ${pct}%\n`)
  }
  if (breach) {
    process.stdout.write(
      `::warning title=Flaky budget exceeded::count=${flakyTitles.length} max=${maxCount}` +
        (maxRate != null ? `, rate=${flakyRate.toFixed(4)} max=${maxRate}` : "") +
        `\n`
    )
  }
}

if (breach) {
  console.error("[check-playwright-flaky] Flaky budget exceeded:")
  for (const title of flakyTitles) console.error(`- ${title}`)
  if (totalSpecs > 0) {
    console.error(
      `[check-playwright-flaky] count=${flakyTitles.length} (max ${maxCount}), rate=${flakyRate.toFixed(4)}${
        maxRate != null ? ` (max ${maxRate})` : ""
      }`
    )
  }
  if (softMode) {
    console.error("[check-playwright-flaky] FLAKY_SOFT_MODE=1 — not failing the build.")
    process.exit(0)
  }
  process.exit(1)
}

if (flakyTitles.length > 0) {
  console.log(
    `[check-playwright-flaky] WITHIN BUDGET: ${flakyTitles.length} flaky / ${totalSpecs} specs ` +
      `(max ${maxCount}${maxRate != null ? `, rate cap ${maxRate}` : ""})`
  )
} else {
  console.log(`[check-playwright-flaky] OK: 0 flaky tests over ${totalSpecs} specs`)
}
