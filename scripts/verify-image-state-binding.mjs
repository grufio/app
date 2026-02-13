/**
 * Verify remote rollout gates for master-image/state binding.
 *
 * Responsibilities:
 * - Ensure at most one active master image exists per project.
 * - Ensure each active master has a matching `project_image_state` row bound by `image_id`.
 * - Ensure persisted master state is not stale (`image_id` null/mismatch) when an active master exists.
 *
 * Exit codes:
 * - 0: OK (all gates satisfied)
 * - 1: Any gate failed or query execution failed
 *
 * Requirements:
 * - `SUPABASE_DB_URL` (or `DATABASE_URL`) must point to target Postgres.
 * - `psql` must be available in PATH.
 */
import { spawnSync } from "node:child_process"

function fail(message) {
  console.error(message)
  process.exit(1)
}

function getDbUrl() {
  const url = (process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? "").trim()
  if (!url) {
    fail("Missing SUPABASE_DB_URL (or DATABASE_URL). Cannot run rollout verification.")
  }
  return url
}

function runQuery(dbUrl, sql) {
  const res = spawnSync(
    "psql",
    [dbUrl, "-X", "-A", "-F", "\t", "-t", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  )

  if (res.error) {
    fail(`Failed to execute psql: ${String(res.error.message ?? res.error)}`)
  }
  if (res.status !== 0) {
    const err = (res.stderr ?? "").trim() || `psql exited with ${res.status}`
    fail(`Verification query failed:\n${err}`)
  }

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

  const multipleActive = runQuery(
    dbUrl,
    `
      select project_id::text || E'\\t' || count(*)::text
      from public.project_images
      where role = 'master'
        and is_active is true
        and deleted_at is null
      group by project_id
      having count(*) > 1
      order by project_id;
    `
  )

  const activeWithoutState = runQuery(
    dbUrl,
    `
      select pi.project_id::text || E'\\t' || pi.id::text
      from public.project_images pi
      left join public.project_image_state pis
        on pis.project_id = pi.project_id
       and pis.role = 'master'
       and pis.image_id = pi.id
      where pi.role = 'master'
        and pi.is_active is true
        and pi.deleted_at is null
        and pis.project_id is null
      order by pi.project_id;
    `
  )

  const staleState = runQuery(
    dbUrl,
    `
      select pis.project_id::text || E'\\t' || coalesce(pis.image_id::text, 'NULL') || E'\\t' || pi.id::text
      from public.project_image_state pis
      join public.project_images pi
        on pi.project_id = pis.project_id
       and pi.role = 'master'
       and pi.is_active is true
       and pi.deleted_at is null
      where pis.role = 'master'
        and (pis.image_id is null or pis.image_id <> pi.id)
      order by pis.project_id;
    `
  )

  const orphanStateImageId = runQuery(
    dbUrl,
    `
      select pis.project_id::text || E'\\t' || pis.image_id::text
      from public.project_image_state pis
      left join public.project_images pi on pi.id = pis.image_id
      where pis.role = 'master'
        and pis.image_id is not null
        and pi.id is null
      order by pis.project_id;
    `
  )

  printRows("Gate failed: multiple active master images found (project_id\\tcount):", multipleActive)
  printRows("Gate failed: active master image has no matching bound state (project_id\\timage_id):", activeWithoutState)
  printRows("Gate failed: stale/mismatched master state binding (project_id\\tstate_image_id\\tactive_image_id):", staleState)
  printRows("Gate failed: state points to missing image_id (project_id\\timage_id):", orphanStateImageId)

  if (multipleActive.length || activeWithoutState.length || staleState.length || orphanStateImageId.length) {
    fail("Image-state rollout verification failed.")
  }

  console.log("OK: image-state rollout gates passed (active master uniqueness + binding consistency).")
}

main()

