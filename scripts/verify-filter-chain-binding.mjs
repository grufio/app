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

function main() {
  const dbUrl = getDbUrl()

  const invalidFilterType = runQuery(
    dbUrl,
    `
      select id::text || E'\\t' || project_id::text || E'\\t' || filter_type::text
      from public.project_image_filters
      where filter_type not in ('pixelate', 'lineart', 'numerate')
      order by project_id, stack_order;
    `
  )

  const duplicateStackOrder = runQuery(
    dbUrl,
    `
      select project_id::text || E'\\t' || stack_order::text || E'\\t' || count(*)::text
      from public.project_image_filters
      group by project_id, stack_order
      having count(*) > 1
      order by project_id, stack_order;
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
      order by f.project_id, f.stack_order;
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
      order by f.project_id, f.stack_order;
    `
  )

  const nonLinearLink = runQuery(
    dbUrl,
    `
      with ordered as (
        select
          project_id,
          id,
          input_image_id,
          output_image_id,
          stack_order,
          lag(output_image_id) over (partition by project_id order by stack_order) as prev_output
        from public.project_image_filters
      )
      select id::text || E'\\t' || project_id::text || E'\\t' || stack_order::text
      from ordered
      where prev_output is not null
        and input_image_id <> prev_output
      order by project_id, stack_order;
    `
  )

  printRows("Gate failed: unsupported filter types (id\\tproject_id\\tfilter_type):", invalidFilterType)
  printRows("Gate failed: duplicate stack_order per project (project_id\\tstack_order\\tcount):", duplicateStackOrder)
  printRows("Gate failed: missing input/output image references (filter_id\\tproject_id):", missingInputOutput)
  printRows("Gate failed: cross-project filter linkage (filter_id\\tfilter_project\\tinput_project\\toutput_project):", crossProjectLink)
  printRows("Gate failed: non-linear chain linkage (filter_id\\tproject_id\\tstack_order):", nonLinearLink)

  if (
    invalidFilterType.length ||
    duplicateStackOrder.length ||
    missingInputOutput.length ||
    crossProjectLink.length ||
    nonLinearLink.length
  ) {
    fail("Filter-chain rollout verification failed.")
  }

  console.log("OK: filter-chain rollout gates passed (types + order + linkage consistency).")
}

main()
