/**
 * Verify remote image-version invariants.
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
  if (!url) fail("Missing SUPABASE_DB_URL (or DATABASE_URL). Cannot run image-version invariant verification.")
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

  const projectsWithoutMaster = runQuery(
    dbUrl,
    `
      select p.id::text
      from public.projects p
      where exists (
        select 1 from public.project_images pi
        where pi.project_id = p.id
          and pi.deleted_at is null
      )
      and not exists (
        select 1 from public.project_images pi
        where pi.project_id = p.id
          and pi.role = 'master'
          and pi.deleted_at is null
      )
      order by p.id;
    `
  )

  const multipleActiveImages = runQuery(
    dbUrl,
    `
      select project_id::text || E'\\t' || count(*)::text
      from public.project_images
      where is_active is true
        and deleted_at is null
      group by project_id
      having count(*) > 1
      order by project_id;
    `
  )

  const missingSourceLinks = runQuery(
    dbUrl,
    `
      select pi.project_id::text || E'\\t' || pi.id::text || E'\\t' || pi.source_image_id::text
      from public.project_images pi
      left join public.project_images src on src.id = pi.source_image_id
      where pi.source_image_id is not null
        and pi.deleted_at is null
        and src.id is null
      order by pi.project_id, pi.id;
    `
  )

  const crossProjectSourceLinks = runQuery(
    dbUrl,
    `
      select pi.id::text || E'\\t' || pi.project_id::text || E'\\t' || src.project_id::text
      from public.project_images pi
      join public.project_images src on src.id = pi.source_image_id
      where pi.deleted_at is null
        and src.deleted_at is null
        and pi.project_id <> src.project_id
      order by pi.project_id, pi.id;
    `
  )

  const cyclesInSourceChain = runQuery(
    dbUrl,
    `
      with recursive walk as (
        select
          pi.project_id,
          pi.id as start_id,
          pi.source_image_id as current_source_id,
          array[pi.id] as visited
        from public.project_images pi
        where pi.deleted_at is null
        union all
        select
          w.project_id,
          w.start_id,
          src.source_image_id as current_source_id,
          w.visited || src.id
        from walk w
        join public.project_images src on src.id = w.current_source_id
        where src.deleted_at is null
          and not (src.id = any(w.visited))
      ),
      loops as (
        select distinct w.project_id, w.start_id, w.current_source_id
        from walk w
        where w.current_source_id = any(w.visited)
      )
      select project_id::text || E'\\t' || start_id::text || E'\\t' || current_source_id::text
      from loops
      order by project_id, start_id;
    `
  )

  const activeNotReachableFromMaster = runQuery(
    dbUrl,
    `
      with recursive roots as (
        select project_id, id
        from public.project_images
        where role = 'master'
          and deleted_at is null
      ),
      chain as (
        select r.project_id, r.id as node_id
        from roots r
        union
        select c.project_id, child.id as node_id
        from chain c
        join public.project_images child on child.source_image_id = c.node_id
        where child.deleted_at is null
      )
      select a.project_id::text || E'\\t' || a.id::text
      from public.project_images a
      left join chain c on c.project_id = a.project_id and c.node_id = a.id
      where a.is_active is true
        and a.deleted_at is null
        and c.node_id is null
      order by a.project_id, a.id;
    `
  )

  printRows("Gate failed: projects with images but no master baseline (project_id):", projectsWithoutMaster)
  printRows("Gate failed: multiple active images in one project (project_id\\tcount):", multipleActiveImages)
  printRows("Gate failed: image points to missing source image (project_id\\timage_id\\tsource_image_id):", missingSourceLinks)
  printRows(
    "Gate failed: image/source project mismatch (image_id\\timage_project_id\\tsource_project_id):",
    crossProjectSourceLinks
  )
  printRows("Gate failed: cycle detected in source_image_id chain (project_id\\tstart_id\\tloop_id):", cyclesInSourceChain)
  printRows(
    "Gate failed: active image is not reachable from any master root (project_id\\tactive_image_id):",
    activeNotReachableFromMaster
  )

  if (
    projectsWithoutMaster.length ||
    multipleActiveImages.length ||
    missingSourceLinks.length ||
    crossProjectSourceLinks.length ||
    cyclesInSourceChain.length ||
    activeNotReachableFromMaster.length
  ) {
    fail("Image-version invariant verification failed.")
  }

  console.log("OK: image-version invariants passed (master roots + active uniqueness + source chain integrity).")
}

main()

