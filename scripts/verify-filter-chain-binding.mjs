/**
 * Verify remote rollout gates for filter-chain binding.
 *
 * Requirements:
 * - SUPABASE_DB_URL (or DATABASE_URL)
 * - psql available in PATH
 */
import { spawnSync } from "node:child_process"

function fail(message) {
  console.error(message)
  process.exit(1)
}

function getDbUrl() {
  const url = (process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? "").trim()
  if (!url) fail("Missing SUPABASE_DB_URL (or DATABASE_URL). Cannot run filter-chain verification.")
  return url
}

function runQuery(dbUrl, sql) {
  const res = spawnSync("psql", [dbUrl, "-X", "-A", "-F", "\t", "-t", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  if (res.error) fail(`Failed to execute psql: ${String(res.error.message ?? res.error)}`)
  if (res.status !== 0) fail(`Verification query failed:\n${(res.stderr ?? "").trim() || `psql exited with ${res.status}`}`)
  return (res.stdout ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
}

function printRows(title, rows) {
  if (!rows.length) return
  console.error(title)
  for (const row of rows) console.error(`- ${row}`)
  console.error("")
}

/**
 * Derive the allowed `filter_type` values from the live CHECK
 * constraint instead of hardcoding them. A hardcoded list went stale
 * once already when the filter set was swapped to the B&W variants;
 * the constraint is the single source of truth. A missing constraint
 * is itself a gate failure.
 */
function deriveAllowedFilterTypes(dbUrl) {
  const def = runQuery(
    dbUrl,
    `
      select pg_get_constraintdef(oid)
      from pg_constraint
      where conrelid = 'public.project_image_filters'::regclass
        and conname = 'project_image_filters_filter_type_ck';
    `
  )
  if (!def.length) {
    fail("Could not find CHECK constraint project_image_filters_filter_type_ck — cannot verify filter types.")
  }
  const allowed = [...def[0].matchAll(/'([^']+)'::text/g)].map((m) => m[1])
  if (!allowed.length) {
    fail(`Could not parse allowed filter types from constraint definition: ${def[0]}`)
  }
  return allowed
}

function main() {
  const dbUrl = getDbUrl()

  const allowedFilterTypes = deriveAllowedFilterTypes(dbUrl)
  const allowedList = allowedFilterTypes.map((t) => `'${t.replace(/'/g, "''")}'`).join(", ")

  const invalidFilterType = runQuery(
    dbUrl,
    `
      select id::text || E'\\t' || project_id::text || E'\\t' || filter_type::text
      from public.project_image_filters
      where filter_type not in (${allowedList})
      order by project_id;
    `
  )

  // Single-filter model (#506 dropped stack_order; project_id is UNIQUE):
  // a project must hold at most one filter row. This replaces the former
  // duplicate-stack_order check.
  const multipleFiltersPerProject = runQuery(
    dbUrl,
    `
      select project_id::text || E'\\t' || count(*)::text
      from public.project_image_filters
      group by project_id
      having count(*) > 1
      order by project_id;
    `
  )

  const missingInputOutput = runQuery(
    dbUrl,
    `
      select f.id::text || E'\\t' || f.project_id::text
      from public.project_image_filters f
      left join public.project_images i on i.id = f.input_image_id
      left join public.project_images o on o.id = f.output_image_id
      where i.id is null or o.id is null
      order by f.project_id;
    `
  )

  const crossProjectLink = runQuery(
    dbUrl,
    `
      select f.id::text || E'\\t' || f.project_id::text || E'\\t' || i.project_id::text || E'\\t' || o.project_id::text
      from public.project_image_filters f
      join public.project_images i on i.id = f.input_image_id
      join public.project_images o on o.id = f.output_image_id
      where i.project_id <> f.project_id
         or o.project_id <> f.project_id
      order by f.project_id;
    `
  )

  printRows("Gate failed: unsupported filter types (id\\tproject_id\\tfilter_type):", invalidFilterType)
  printRows("Gate failed: more than one filter per project (project_id\\tcount):", multipleFiltersPerProject)
  printRows("Gate failed: missing input/output image references (filter_id\\tproject_id):", missingInputOutput)
  printRows("Gate failed: cross-project filter linkage (filter_id\\tfilter_project\\tinput_project\\toutput_project):", crossProjectLink)

  if (
    invalidFilterType.length ||
    multipleFiltersPerProject.length ||
    missingInputOutput.length ||
    crossProjectLink.length
  ) {
    fail("Filter-chain rollout verification failed.")
  }

  console.log("OK: filter-chain rollout gates passed (types + single-filter + linkage consistency).")
}

main()
