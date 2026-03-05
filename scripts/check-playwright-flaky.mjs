/**
 * Fail CI if Playwright passed only via retries.
 */
import fs from "node:fs"
import path from "node:path"

const reportPath = path.resolve(process.cwd(), "playwright-report/results.json")
const summaryPath = path.resolve(process.cwd(), "playwright-report/flaky-summary.json")
if (!fs.existsSync(reportPath)) {
  console.error(`[check-playwright-flaky] Missing report: ${reportPath}`)
  process.exit(1)
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"))
const flakyTitles = []

function visitSuite(suite, parent = []) {
  const titlePath = suite.title ? [...parent, suite.title] : parent
  for (const spec of suite.specs ?? []) {
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

const summary = {
  generated_at: new Date().toISOString(),
  flaky_count: flakyTitles.length,
  flaky_titles: flakyTitles,
}
fs.mkdirSync(path.dirname(summaryPath), { recursive: true })
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))
console.log(`[check-playwright-flaky] Wrote summary: ${summaryPath}`)

if (flakyTitles.length > 0) {
  console.error("[check-playwright-flaky] Flaky tests detected (passed only after retry):")
  for (const title of flakyTitles) console.error(`- ${title}`)
  process.exit(1)
}

console.log("[check-playwright-flaky] OK: no flaky retries detected")
