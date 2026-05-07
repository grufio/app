/**
 * Budget gate for `as unknown as` type-system escape hatches.
 *
 * Why: TypeScript strict only enforces what the compiler can see. Each
 * `as unknown as Foo` hands the compiler a forged passport — past that
 * point, runtime shape mismatches walk in unchecked. The codebase had 53
 * such escapes in production (excluding tests, where they're often the
 * shortest path to fake a type for a mock).
 *
 * The gate freezes that 53 as a hard ceiling. PRs that *increase* the
 * count fail; PRs that *decrease* it pass and the new count is reported
 * so the baseline can be lowered manually. We don't auto-update the
 * baseline because each ratchet down should be a deliberate decision
 * recorded in the JSON file's history.
 *
 * Tests are excluded from the budget — `as unknown as` against a vi.fn
 * mock is a different concern (the mock is the contract, not the
 * production type), and policing it just pushes engineers toward
 * `any`-typed mocks which are worse.
 *
 * Override (rare): set `ALLOW_TYPE_ESCAPE_BUDGET_BREACH=1` to skip the
 * gate for one run — useful when bisecting a regression unrelated to
 * type hygiene.
 */
import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const NEEDLE = "as unknown as"
const BUDGET_FILE = path.join(ROOT, "scripts", ".type-escape-budget.json")

const SCAN_DIRS = ["app", "lib", "services", "features", "components"]
const FILE_EXT = /\.(ts|tsx)$/
const TEST_EXT = /\.test\.(ts|tsx)$/

function* walk(dir) {
  if (!fs.existsSync(dir)) return
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next" || ent.name === ".git") continue
      yield* walk(full)
    } else if (ent.isFile()) {
      yield full
    }
  }
}

function countEscapes() {
  let count = 0
  const offenders = []
  for (const dir of SCAN_DIRS) {
    for (const file of walk(path.join(ROOT, dir))) {
      if (!FILE_EXT.test(file)) continue
      if (TEST_EXT.test(file)) continue
      const text = fs.readFileSync(file, "utf8")
      let from = 0
      let perFile = 0
      while (true) {
        const i = text.indexOf(NEEDLE, from)
        if (i < 0) break
        perFile += 1
        from = i + NEEDLE.length
      }
      if (perFile > 0) {
        count += perFile
        offenders.push({ file: path.relative(ROOT, file), perFile })
      }
    }
  }
  return { count, offenders }
}

function readBudget() {
  if (!fs.existsSync(BUDGET_FILE)) {
    console.error(`[check-type-escape-budget] Missing ${path.relative(ROOT, BUDGET_FILE)}`)
    console.error("Create it first via: npm run check:type-escape-budget -- --init")
    process.exit(1)
  }
  const raw = fs.readFileSync(BUDGET_FILE, "utf8")
  const parsed = JSON.parse(raw)
  if (typeof parsed.budget !== "number" || parsed.budget < 0) {
    console.error(`[check-type-escape-budget] ${path.relative(ROOT, BUDGET_FILE)} is malformed.`)
    process.exit(1)
  }
  return parsed
}

function writeBudget(value, currentOffenders) {
  const payload = {
    budget: value,
    note:
      "Hard ceiling for `as unknown as` in production code (excludes *.test.ts/.tsx). " +
      "Gate fails if count exceeds budget. Lower this number deliberately as the codebase improves.",
    last_updated: new Date().toISOString().split("T")[0],
    top_offenders: currentOffenders.slice(0, 10),
  }
  fs.writeFileSync(BUDGET_FILE, JSON.stringify(payload, null, 2) + "\n", "utf8")
}

const args = process.argv.slice(2)
const { count, offenders } = countEscapes()
offenders.sort((a, b) => b.perFile - a.perFile)

if (args.includes("--init")) {
  writeBudget(count, offenders)
  console.log(
    `[check-type-escape-budget] Wrote baseline budget=${count} to ${path.relative(ROOT, BUDGET_FILE)}`,
  )
  process.exit(0)
}

if (process.env.ALLOW_TYPE_ESCAPE_BUDGET_BREACH === "1") {
  console.warn(
    `[check-type-escape-budget] ALLOW_TYPE_ESCAPE_BUDGET_BREACH=1 — current count is ${count}, gate skipped.`,
  )
  process.exit(0)
}

const { budget } = readBudget()

if (count > budget) {
  console.error(
    `[check-type-escape-budget] BUDGET EXCEEDED — count=${count} > budget=${budget} (delta=+${count - budget})`,
  )
  console.error("\nTop offenders:")
  for (const o of offenders.slice(0, 10)) {
    console.error(`  ${o.perFile.toString().padStart(3)}× ${o.file}`)
  }
  console.error(
    "\nFix: remove `as unknown as` casts where possible (e.g. tighten the upstream type, " +
      "use a narrower runtime guard, or refactor to a typed RPC return). If the increase " +
      "is unavoidable and intentional, raise the number in scripts/.type-escape-budget.json " +
      "deliberately as part of the same PR.",
  )
  process.exit(1)
}

if (count < budget) {
  console.log(
    `[check-type-escape-budget] OK: count=${count} < budget=${budget} — consider lowering ` +
      `the baseline in scripts/.type-escape-budget.json to ${count}.`,
  )
  process.exit(0)
}

console.log(`[check-type-escape-budget] OK: count=${count} == budget=${budget}.`)
