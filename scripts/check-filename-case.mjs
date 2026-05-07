/**
 * Enforce the file-naming convention documented in `docs/conventions.md`:
 *
 *   - kebab-case is the default for new files (lib/, services/,
 *     app/api/**, features/**, components/**, hooks/**, e2e/, scripts/).
 *   - PascalCase is grandfathered for a small set of long-lived top-level
 *     containers, listed in PASCAL_CASE_ALLOWLIST below.
 *
 * Why a script and not eslint-plugin-unicorn: the project currently has
 * no unicorn dep, and this rule is the only one we need from it. A
 * focused script keeps the lint surface minimal and is easy to audit.
 *
 * Failure mode this catches: a new file is added in PascalCase that
 * isn't on the allowlist — the gate stops it before it lands. Existing
 * grandfathered files keep working without false positives.
 *
 * To grandfather a new top-level container:
 *   1. Add it to PASCAL_CASE_ALLOWLIST below.
 *   2. Document the rationale in the same PR (matches how docs/conventions.md
 *      describes the "long-lived container" exception).
 */
import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()

const SCAN_DIRS = ["app", "lib", "services", "features", "components", "hooks", "scripts", "e2e", "tests"]
const FILE_EXT = /\.(ts|tsx|mjs|js)$/

// Files that match a Next.js / framework reserved name keep their literal
// casing — Next reads them by exact path, so renaming would break routing.
const FRAMEWORK_RESERVED = new Set([
  "page.tsx",
  "page.ts",
  "layout.tsx",
  "layout.ts",
  "loading.tsx",
  "loading.ts",
  "error.tsx",
  "error.ts",
  "not-found.tsx",
  "not-found.ts",
  "route.ts",
  "route.tsx",
  "globals.css",
  "providers.tsx",
  "providers.ts",
  "middleware.ts",
  "favicon.ico",
])

// Existing PascalCase files that pre-date the convention. Don't rename in
// drive-by PRs (see docs/conventions.md). Anything *not* on this list and
// in PascalCase is a new file — fail the gate.
const PASCAL_CASE_ALLOWLIST = new Set([
  "components/navigation/AppSidebarMain.tsx",
  "components/navigation/ProjectSidebar.tsx",
  "components/navigation/SidebarFrame.tsx",
  "features/editor/components/ProjectEditorLayout.tsx",
  "features/editor/components/ProjectEditorStage.tsx",
  "features/editor/components/ProjectEditorLeftPanel.tsx",
  "features/editor/components/ProjectEditorRightPanel.tsx",
  "features/editor/components/BaseFilterController.tsx",
  "features/editor/components/FilterSelectionController.tsx",
  "features/editor/components/NumerateFilterController.tsx",
  "features/editor/components/LineArtFilterController.tsx",
  "features/editor/components/PixelateFilterController.tsx",
  "features/editor/components/TabsSidepanel.tsx",
  "app/projects/[projectId]/_components/ProjectEditorShell.client.tsx",
])

// kebab-case + numbers + dots for compound suffixes (.test.ts, .contract.test.tsx, .d.ts).
// Allows leading underscore for Next-internal folders we shouldn't touch.
const KEBAB_RE = /^_?[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9-]+)*$/

function isAcceptable(filePath) {
  const basename = path.basename(filePath)
  if (FRAMEWORK_RESERVED.has(basename)) return true

  const rel = path.relative(ROOT, filePath).replace(/\\/g, "/")
  if (PASCAL_CASE_ALLOWLIST.has(rel)) return true

  // Strip extension once for kebab-case match. Compound extensions like
  // `.test.ts` are handled by the regex's `(\.[a-z0-9-]+)*` segment.
  const stem = basename.replace(/\.(ts|tsx|mjs|js)$/, "")
  return KEBAB_RE.test(stem)
}

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

const offenders = []
for (const dir of SCAN_DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    if (!FILE_EXT.test(file)) continue
    if (!isAcceptable(file)) {
      offenders.push(path.relative(ROOT, file))
    }
  }
}

if (offenders.length > 0) {
  console.error(
    `[check-filename-case] ${offenders.length} file(s) violate the kebab-case convention\n` +
      `(see docs/conventions.md):\n`,
  )
  for (const f of offenders) console.error(`  ${f}`)
  console.error(
    `\nFix: rename to kebab-case, OR — if this is a long-lived top-level\n` +
      `container that mirrors its default-export name 1:1 — add the path to\n` +
      `PASCAL_CASE_ALLOWLIST in scripts/check-filename-case.mjs and\n` +
      `document the rationale in the same PR.`,
  )
  process.exit(1)
}

console.log(
  `[check-filename-case] OK: kebab-case convention enforced, ${PASCAL_CASE_ALLOWLIST.size} grandfathered exceptions.`,
)
