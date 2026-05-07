-- gruf.io — align project_image_state schema to production
--
-- Backstory
-- ---------
-- Production has the following shape on `project_image_state`:
--   - PK = (project_id, image_id)
--   - image_id NOT NULL
--   - FK image_id -> project_images(id) ON DELETE CASCADE
--
-- The migration history committed to the repo only ever produces:
--   - PK = (project_id, role)
--   - image_id NULL-able
--   - FK image_id -> project_images(id) ON DELETE SET NULL
--
-- The discrepancy was uncovered by the integration test for
-- `set_active_master_with_state`, which performs an UPSERT with
-- `on conflict (project_id, image_id)` — works in prod, 42P10 locally.
-- Production was hand-modified at some point (likely via Studio's SQL
-- editor) without the change being captured as a migration. This file
-- captures it now so:
--   - new local environments boot to the same schema as production
--   - re-running migrations on prod is a no-op (idempotent guards
--     below short-circuit when prod's existing constraints are found)
--
-- Effects
-- -------
-- 1. Backfill any project_image_state rows where image_id is NULL by
--    pointing them at the project's active image for that role.
-- 2. Promote image_id to NOT NULL (only if currently nullable).
-- 3. Replace the FK ON DELETE SET NULL with ON DELETE CASCADE
--    (only if currently SET NULL — production already has CASCADE).
-- 4. Replace the (project_id, role) PK with (project_id, image_id)
--    (only if the existing PK is on the legacy (project_id, role)
--    columns).

-- 1. Backfill image_id where NULL.
update public.project_image_state pis
set image_id = pi.id
from public.project_images pi
where pis.image_id is null
  and pi.project_id = pis.project_id
  and pi.is_active = true
  and pi.deleted_at is null
  -- Match the role-to-kind correspondence used elsewhere: a 'master'
  -- state row should pin to the active master image; a 'working' row
  -- to the active working_copy. Anything else is unexpected and will
  -- be deleted in the next step.
  and (
    (pis.role::text = 'master' and pi.kind = 'master')
    or (pis.role::text = 'working' and pi.kind = 'working_copy')
  );

-- Drop any state rows that still don't have an image_id — they're
-- orphaned (no active image of the matching kind exists). Without
-- this, `alter ... set not null` would fail.
delete from public.project_image_state where image_id is null;

-- 2. NOT NULL on image_id (idempotent).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_image_state'
      and column_name = 'image_id'
      and is_nullable = 'YES'
  ) then
    alter table public.project_image_state
      alter column image_id set not null;
  end if;
end $$;

-- 3. ON DELETE CASCADE on image_id FK (idempotent).
do $$
declare
  v_delete_rule text;
begin
  select rc.delete_rule
    into v_delete_rule
  from information_schema.referential_constraints rc
  where rc.constraint_schema = 'public'
    and rc.constraint_name = 'project_image_state_image_id_fkey';

  if v_delete_rule is not null and v_delete_rule <> 'CASCADE' then
    alter table public.project_image_state
      drop constraint project_image_state_image_id_fkey;

    alter table public.project_image_state
      add constraint project_image_state_image_id_fkey
      foreign key (image_id) references public.project_images(id)
      on delete cascade;
  end if;
end $$;

-- 4. PK swap (project_id, role) -> (project_id, image_id), idempotent.
do $$
declare
  v_pk_columns text;
begin
  select string_agg(att.attname, ',' order by k.ord)
    into v_pk_columns
  from pg_constraint c
  join unnest(c.conkey) with ordinality as k(attnum, ord)
    on true
  join pg_attribute att
    on att.attrelid = c.conrelid and att.attnum = k.attnum
  where c.conrelid = 'public.project_image_state'::regclass
    and c.contype = 'p';

  if v_pk_columns = 'project_id,role' then
    alter table public.project_image_state
      drop constraint project_image_state_pk;

    alter table public.project_image_state
      add constraint project_image_state_pk
      primary key (project_id, image_id);
  end if;
end $$;
