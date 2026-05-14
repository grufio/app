-- @intent-data-migration
--
-- One-time data repair: restore two `project_images` invariants that
-- editor-refactoring fallout left violated on prod.
--
--   Invariant A — `is_active` is never true on a soft-deleted row.
--   Invariant B — every project has exactly one non-deleted active
--                 image, and that image is a valid display target
--                 (not an orphaned filter output).
--
-- Background. The editor refactoring left a handful of projects with
-- an invalid `is_active` state. Two distinct shapes were found:
--
--   (1) Orphaned active filter output. Migration
--       20260514105000_purge_legacy_filter_rows.sql deleted the
--       legacy `project_image_filters` rows but left the filter-output
--       `project_images` rows in place — including their `is_active`
--       flag. A project whose active image was such an output now
--       points `is_active` at a `filter_working_copy` image that no
--       filter-chain row references.
--
--   (2) Active flag stuck on soft-deleted rows. On at least one
--       project the working-copy resolution churned through many
--       short-lived copies; they were all soft-deleted, but the
--       `is_active = true` flag was left behind on the soft-deleted
--       rows. The project ends up with zero *non-deleted* active
--       images, so the editor cannot resolve a display target.
--
-- This is not a bug in the current code — `resolveEditorTargetImageRows`
-- now pins `preferredWorking` to the stable plain `working_copy`, so
-- no new churn is produced. This migration only cleans up the
-- historical debris.
--
-- Repair, in two steps:
--   Step 1 — clear `is_active` on every soft-deleted row, project-wide
--            (enforces invariant A).
--   Step 2 — for every project whose remaining non-deleted `is_active`
--            state is still invalid (not exactly one active image, or
--            its single active image is an orphaned filter output),
--            clear `is_active` and set it on the project's master
--            image. Master-active is the proven-safe default state
--            every filter-free project already sits in; the editor
--            re-derives working copies and filter display from there.
--
-- No rows are deleted. Orphaned / soft-deleted image rows are left in
-- place (harmless once de-activated, separately garbage-collectable),
-- which keeps this migration auditable and reversible.
--
-- Guards: fails loud if a broken project has no master image, or if
-- the post-fix invariants do not hold.
--
-- Prod dry-run at authoring time: 13 soft-deleted rows cleared,
-- 2 projects repointed to master.

do $$
declare
  v_deleted_cleared int;
  v_count int;
  v_missing_master int;
begin
  -- Step 1: invariant A — is_active must never be true on a
  -- soft-deleted row. Clear it everywhere.
  with cleared as (
    update public.project_images
    set is_active = false
    where is_active = true
      and deleted_at is not null
    returning 1
  )
  select count(*) into v_deleted_cleared from cleared;

  raise notice 'fix_invalid_active_image_state: cleared is_active on % soft-deleted row(s)',
    v_deleted_cleared;

  -- Step 2: identify projects whose remaining (non-deleted) is_active
  -- state is still invalid — either not exactly one active image, or
  -- a single active image that is an orphaned filter output (a
  -- filter_working_copy that is neither the reusable "(filter working)"
  -- base nor referenced by any project_image_filters row).
  create temp table _broken_projects on commit drop as
  with active_counts as (
    select
      p.id as project_id,
      (
        select count(*) from public.project_images pi
        where pi.project_id = p.id
          and pi.is_active = true
          and pi.deleted_at is null
      ) as active_cnt
    from public.projects p
  ),
  orphan_active as (
    select pi.project_id
    from public.project_images pi
    where pi.is_active = true
      and pi.deleted_at is null
      and pi.kind = 'filter_working_copy'
      and pi.name not like '% (filter working)'
      and not exists (
        select 1 from public.project_image_filters f
        where f.output_image_id = pi.id
           or f.input_image_id = pi.id
      )
  )
  select
    ac.project_id,
    (
      select m.id from public.project_images m
      where m.project_id = ac.project_id
        and m.kind = 'master'
        and m.deleted_at is null
      order by m.created_at asc
      limit 1
    ) as master_image_id
  from active_counts ac
  where ac.active_cnt <> 1
     or ac.project_id in (select project_id from orphan_active);

  select
    count(*) filter (where master_image_id is not null),
    count(*) filter (where master_image_id is null)
  into v_count, v_missing_master
  from _broken_projects;

  raise notice 'fix_invalid_active_image_state: % broken project(s), % with no master',
    v_count, v_missing_master;

  if v_missing_master > 0 then
    raise exception
      'found % broken project(s) with no master image — manual review required before this migration can run',
      v_missing_master;
  end if;

  -- Clear is_active on the (now non-deleted) active rows of broken
  -- projects.
  update public.project_images
  set is_active = false
  where project_id in (select project_id from _broken_projects)
    and is_active = true;

  -- Set the project's master active in their place.
  update public.project_images pi
  set is_active = true
  from _broken_projects b
  where pi.id = b.master_image_id;

  -- Post-fix invariant A: no soft-deleted row is active anywhere.
  if exists (
    select 1 from public.project_images
    where is_active = true and deleted_at is not null
  ) then
    raise exception 'post-fix invariant A violated: a soft-deleted row is still active';
  end if;

  -- Post-fix invariant B: every repaired project has exactly one
  -- non-deleted active image.
  if exists (
    select 1
    from public.project_images
    where deleted_at is null
      and project_id in (select project_id from _broken_projects)
    group by project_id
    having count(*) filter (where is_active) <> 1
  ) then
    raise exception 'post-fix invariant B violated: a repaired project does not have exactly one active non-deleted image';
  end if;

  raise notice 'fix_invalid_active_image_state: done, % project(s) repaired', v_count;
end $$;
