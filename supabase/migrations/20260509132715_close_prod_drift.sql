-- @intent-backfill-migration
-- close-prod-drift: bring migration intent in line with prod state.
--
-- Backstory
-- ---------
-- The squashed baseline (PR #30) was built by replaying migrations into
-- a clean DB and dumping the result, NOT by pg_dumping prod. Items that
-- only exist on prod (because they were applied via Studio SQL editor
-- without a corresponding migration commit) are therefore missing from
-- the squashed file. This migration backfills them so fresh local DBs
-- match prod and `verify:schema-drift` becomes green.
--
-- Pre-flight psql audit on 2026-05-09 against prod confirmed:
--   - No NULL rows in any column promoted to NOT NULL below
--   - dpi_x/dpi_y on project_images: NOT NULL, default 72, check > 0
--   - collect_project_image_delete_targets: signature + body captured
--   - set_active_master_with_state: only one signature on prod (the
--     `_u` text-typed variant); no DROP needed
--
-- Every statement is idempotent so the migration is a no-op on prod
-- (everything already there) and a structural backfill on fresh local
-- DBs (everything gets created).

-- ====================================================================
-- 1. project_grid spacing — promote to NOT NULL.
-- Originally intended in 20260130120000_project_grid_require_xy_spacing.sql
-- but the SET NOT NULL never stuck on prod (likely because the migration
-- committed before backfill rows were eliminated; today there are 0).
-- ====================================================================
alter table public.project_grid
  alter column spacing_x_value set not null,
  alter column spacing_y_value set not null;

-- ====================================================================
-- 2. project_image_state px_u dimensions — promote to NOT NULL.
-- App (lib/supabase/image-state.ts:52) treats them as required.
-- ====================================================================
alter table public.project_image_state
  alter column height_px_u set not null,
  alter column width_px_u  set not null;

-- ====================================================================
-- 3. project_images dpi_x / dpi_y — backfill into intent.
-- App (services/editor/server/master-image-upload/insert-master.ts)
-- writes both. Prod has them as `numeric NOT NULL DEFAULT 72` with
-- `> 0` check constraints.
-- ====================================================================
alter table public.project_images
  add column if not exists dpi_x numeric not null default 72,
  add column if not exists dpi_y numeric not null default 72;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'project_images_dpi_x_check'
  ) then
    alter table public.project_images
      add constraint project_images_dpi_x_check check (dpi_x > 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'project_images_dpi_y_check'
  ) then
    alter table public.project_images
      add constraint project_images_dpi_y_check check (dpi_y > 0);
  end if;
end $$;

-- ====================================================================
-- 4. collect_project_image_delete_targets RPC — backfill into intent.
-- App (app/api/projects/[projectId]/images/master/{[imageId]/route.ts,
-- route.ts}) calls this. Definition captured 1:1 from prod via
-- pg_get_functiondef.
-- ====================================================================
create or replace function public.collect_project_image_delete_targets(
  p_project_id uuid,
  p_root_image_id uuid
)
returns table (id uuid, storage_bucket text, storage_path text)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with recursive lineage as (
    select pi.id
    from public.project_images pi
    where pi.project_id = p_project_id
      and pi.id = p_root_image_id
      and pi.deleted_at is null

    union all

    select child.id
    from public.project_images child
    join lineage parent on child.source_image_id = parent.id
    where child.project_id = p_project_id
      and child.deleted_at is null
  )
  select pi.id, pi.storage_bucket, pi.storage_path
  from public.project_images pi
  join lineage l on l.id = pi.id
  where pi.project_id = p_project_id
    and pi.deleted_at is null;
$function$;
