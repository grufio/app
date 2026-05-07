/**
 * Verify dated review docs carry a `> Status: …` banner.
 *
 * Convention (see `docs/conventions.md` → "Dated review documents"):
 * every `docs/app-review-*.md` and `docs/system-review-YYYY-MM-DD.md`
 * must declare its status (closed / in progress / archived) directly
 * under the H1 so a reader can't mistake an old snapshot for live
 * planning.
 *
 * Failure mode this catches: a new dated review is added without a
 * status banner, or an old one's banner is dropped during an edit.
 */
import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const DOCS_DIR = path.join(ROOT, "docs")

const TARGET_RE = /^(app-review.*|system-review-\d{4}-\d{2}-\d{2})\.md$/

if (!fs.existsSync(DOCS_DIR)) {
  console.error(`[check-review-status-banner] Missing ${DOCS_DIR}`)
  process.exit(1)
}

// The banner must appear within the first ~12 lines of the file (right
// under the H1) so it's the first thing a reader sees.
const BANNER_RE = /^>\s*(?:✅|⏳|🟡)\s+\*\*Status:\s+(closed|in progress|archived)/i

const offenders = []
for (const name of fs.readdirSync(DOCS_DIR)) {
  if (!TARGET_RE.test(name)) continue
  const text = fs.readFileSync(path.join(DOCS_DIR, name), "utf8")
  const head = text.split("\n").slice(0, 12)
  const hasBanner = head.some((line) => BANNER_RE.test(line))
  if (!hasBanner) offenders.push(name)
}

if (offenders.length > 0) {
  console.error("[check-review-status-banner] dated review(s) missing a `> Status:` banner:")
  for (const f of offenders) console.error(`  docs/${f}`)
  console.error(
    "\nFix: add one of these lines under the H1 (within the first 12 lines):\n" +
      "  > ✅ **Status: closed (YYYY-MM-DD)** — summary\n" +
      "  > ⏳ **Status: in progress** — link\n" +
      "  > 🟡 **Status: archived** — superseded by …\n",
  )
  process.exit(1)
}

const checked = fs.readdirSync(DOCS_DIR).filter((n) => TARGET_RE.test(n)).length
console.log(`[check-review-status-banner] OK: ${checked} dated review doc(s) carry a status banner.`)
