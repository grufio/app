-- =========================================================
-- bootstrap part 2: schema mutations that *use* the new
-- enum value 'asset' added in part 1
-- =========================================================
-- The previous bootstrap migration added 'asset' to the
-- image_role enum and *also* used it in CHECK constraints
-- inside the same transaction. Postgres rejects that
-- (SQLSTATE 55P04: unsafe use of new value of enum type).
--
-- Production never hit this because the schema was assembled
-- across many real migrations. Local `supabase start` —
-- which replays each migration as a single txn — does.
--
-- The fix splits at the natural seam: part 1 commits the new
-- enum value; part 2 (this file) is the rest of the original
-- bootstrap, free to reference 'asset'.

-- Allow multiple images per role
alter table public.project_images
  drop constraint if exists project_images_one_per_role;

-- Storage metadata
alter table public.project_images
  add column if not exists storage_bucket text not null default 'project_images';

-- Active master flag
alter table public.project_images
  add column if not exists is_active boolean not null default false;

-- Optional soft delete
alter table public.project_images
  add column if not exists deleted_at timestamptz;

-- Backfill active master (latest master per project)
with ranked as (
  select
    id,
    project_id,
    row_number() over (partition by project_id order by created_at desc) as rn
  from public.project_images
  where role = 'master' and deleted_at is null
)
update public.project_images pi
set is_active = (ranked.rn = 1)
from ranked
where pi.id = ranked.id;

-- Indexes
create index if not exists project_images_project_id_role_created_at_idx
  on public.project_images (project_id, role, created_at desc);

-- Enforce one active master per project
create unique index if not exists project_images_one_active_master_idx
  on public.project_images (project_id)
  where role = 'master' and is_active is true and deleted_at is null;

-- Helpers to atomically switch active master
create or replace function public.set_active_master_image(p_project_id uuid, p_image_id uuid)
returns void
language plpgsql
as $$
begin
  update public.project_images
  set is_active = false
  where project_id = p_project_id
    and role = 'master'
    and deleted_at is null;

  update public.project_images
  set is_active = true
  where id = p_image_id
    and project_id = p_project_id
    and role = 'master'
    and deleted_at is null;
end;
$$;

create or replace function public.set_active_master_latest(p_project_id uuid)
returns void
language plpgsql
as $$
declare
  v_image_id uuid;
begin
  select id
  into v_image_id
  from public.project_images
  where project_id = p_project_id
    and role = 'master'
    and deleted_at is null
  order by created_at desc
  limit 1;

  if v_image_id is not null then
    perform public.set_active_master_image(p_project_id, v_image_id);
  end if;
end;
$$;

-- =========================================================
-- db/020_project_images_storage_path.sql
-- =========================================================
-- NOTE:
-- Storage policy changes in db/020 require elevated privileges on storage.objects.
-- Apply db/020_project_images_storage_path.sql manually in the Supabase SQL editor.

-- =========================================================
-- db/021_project_image_state_image_id.sql
-- =========================================================
-- gruf.io - Bind persisted master transform state to active image id

alter table public.project_image_state
  add column if not exists image_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_image_state_image_id_fkey'
      and conrelid = 'public.project_image_state'::regclass
  ) then
    alter table public.project_image_state
      add constraint project_image_state_image_id_fkey
      foreign key (image_id)
      references public.project_images(id)
      on delete set null;
  end if;
end $$;

create index if not exists project_image_state_project_role_image_idx
  on public.project_image_state (project_id, role, image_id);

-- Backfill existing master-state rows to current active master image.
with active_master as (
  select distinct on (project_id)
    project_id,
    id as image_id
  from public.project_images
  where role = 'master'
    and is_active is true
    and deleted_at is null
  order by project_id, created_at desc
)
update public.project_image_state pis
set image_id = am.image_id
from active_master am
where pis.project_id = am.project_id
  and pis.role = 'master'
  and pis.image_id is null;

create or replace function public.set_active_master_with_state(
  p_project_id uuid,
  p_image_id uuid,
  p_width_px integer,
  p_height_px integer
)
returns void
language plpgsql
as $$
declare
  v_w_u bigint;
  v_h_u bigint;
  v_artboard_w_u bigint;
  v_artboard_h_u bigint;
begin
  v_w_u := greatest(1, p_width_px)::bigint * 1000000;
  v_h_u := greatest(1, p_height_px)::bigint * 1000000;

  update public.project_images
  set is_active = false
  where project_id = p_project_id
    and role = 'master'
    and deleted_at is null;

  update public.project_images
  set is_active = true
  where id = p_image_id
    and project_id = p_project_id
    and role = 'master'
    and deleted_at is null;

  select
    case
      when pw.width_px_u is not null then pw.width_px_u::bigint
      else greatest(1, pw.width_px)::bigint * 1000000
    end,
    case
      when pw.height_px_u is not null then pw.height_px_u::bigint
      else greatest(1, pw.height_px)::bigint * 1000000
    end
  into v_artboard_w_u, v_artboard_h_u
  from public.project_workspace pw
  where pw.project_id = p_project_id;

  if v_artboard_w_u is null then v_artboard_w_u := v_w_u; end if;
  if v_artboard_h_u is null then v_artboard_h_u := v_h_u; end if;

  insert into public.project_image_state (
    project_id,
    role,
    image_id,
    x_px_u,
    y_px_u,
    width_px_u,
    height_px_u,
    rotation_deg
  ) values (
    p_project_id,
    'master',
    p_image_id,
    (v_artboard_w_u / 2)::text,
    (v_artboard_h_u / 2)::text,
    v_w_u::text,
    v_h_u::text,
    0
  )
  on conflict (project_id, role)
  do update
    set image_id = excluded.image_id,
        x_px_u = excluded.x_px_u,
        y_px_u = excluded.y_px_u,
        width_px_u = excluded.width_px_u,
        height_px_u = excluded.height_px_u,
        rotation_deg = excluded.rotation_deg;
end;
$$;

-- =========================================================
-- db/026_project_images_master_list_idx.sql
-- =========================================================
-- gruf.io - Runtime index for master image list endpoint
--
-- Optimizes:
-- - GET /api/projects/:projectId/images/master/list
--   filters: project_id, role='master', deleted_at is null
--   order: created_at desc

create index if not exists project_images_master_list_active_idx
  on public.project_images (project_id, created_at desc)
  where role = 'master' and deleted_at is null;

-- =========================================================
-- db/022_project_images_require_dpi.sql
-- =========================================================
-- gruf.io - enforce strict actual DPI for project images
-- Block migration when legacy rows still violate the strict contract.
do $$
declare
  invalid_count bigint;
begin
  select count(*)
    into invalid_count
  from public.project_images
  where dpi is null or dpi <= 0;

  if invalid_count > 0 then
    raise exception using
      message = format(
        'blocked: %s rows in public.project_images have invalid dpi (dpi is null or <= 0)',
        invalid_count
      ),
      hint = 'Run preflight remediation before applying db/022_project_images_require_dpi.sql.';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_images_dpi_gt_zero'
      and conrelid = 'public.project_images'::regclass
  ) then
    alter table public.project_images
      add constraint project_images_dpi_gt_zero
      check (dpi > 0);
  end if;
end $$;

alter table public.project_images
  alter column dpi set not null;

-- =========================================================
-- db/023_project_workspace_artboard_dpi.sql
-- =========================================================
-- gruf.io - Consolidate workspace DPI to a single artboard value
--
-- Goal:
-- - introduce one authoritative DPI field for workspace/artboard: `artboard_dpi`
-- - migrate existing values from legacy columns
-- - remove redundant legacy columns: dpi_x/dpi_y/output_dpi_x/output_dpi_y

alter table public.project_workspace
  add column if not exists artboard_dpi numeric;

do $backfill_artboard_dpi$
begin
  -- Avoid hard references to legacy columns (`dpi_x/dpi_y/output_dpi_x/output_dpi_y`) which may already be dropped.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_workspace'
      and column_name = 'output_dpi'
  ) then
    execute '
      update public.project_workspace
      set artboard_dpi = coalesce(artboard_dpi, output_dpi, 300)
      where artboard_dpi is null
    ';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_workspace'
      and column_name = 'output_dpi_x'
  ) then
    execute '
      update public.project_workspace
      set artboard_dpi = coalesce(artboard_dpi, output_dpi_x, output_dpi_y, 300)
      where artboard_dpi is null
    ';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_workspace'
      and column_name = 'dpi_x'
  ) then
    execute '
      update public.project_workspace
      set artboard_dpi = coalesce(artboard_dpi, dpi_x, dpi_y, 300)
      where artboard_dpi is null
    ';
  else
    execute '
      update public.project_workspace
      set artboard_dpi = coalesce(artboard_dpi, 300)
      where artboard_dpi is null
    ';
  end if;
end
$backfill_artboard_dpi$;

-- Ensure canonical/cached pixel fields are consistent with the new single DPI source.
update public.project_workspace
set
  width_px_u = public.workspace_value_to_px_u(width_value, unit, artboard_dpi)::text,
  height_px_u = public.workspace_value_to_px_u(height_value, unit, artboard_dpi)::text
where width_px_u is null or height_px_u is null;

update public.project_workspace
set
  width_px = greatest(1, (((width_px_u::bigint) + 500000) / 1000000)::int),
  height_px = greatest(1, (((height_px_u::bigint) + 500000) / 1000000)::int);

-- =========================================================
-- db/027_schema_migrations_enable_rls.sql
-- =========================================================
-- gruf.io - Enable RLS on schema_migrations table
alter table if exists public.schema_migrations enable row level security;

-- =========================================================
-- db/028_project_workspace_decouple_dpi_geometry.sql
-- =========================================================
-- gruf.io - Decouple artboard geometry from DPI-only updates
--
-- Goal:
-- - keep canonical geometry (`width_px_u`/`height_px_u`) stable on DPI-only updates
-- - recompute canonical geometry only when width/height values are explicitly edited
-- - keep integer px cache (`width_px`/`height_px`) derived from canonical geometry

create or replace function public.project_workspace_sync_px_cache()
returns trigger
language plpgsql
as $$
declare
  w_u bigint;
  h_u bigint;
  w_px int;
  h_px int;
begin
  if tg_op = 'UPDATE' then
    if new.width_value is distinct from old.width_value
       or new.height_value is distinct from old.height_value then
      -- Explicit geometry edit: recompute canonical geometry from value+unit+dpi.
      new.width_px_u := public.workspace_value_to_px_u(new.width_value, new.unit, new.artboard_dpi)::text;
      new.height_px_u := public.workspace_value_to_px_u(new.height_value, new.unit, new.artboard_dpi)::text;
    else
      -- DPI-only / unit-only / preset-only update: keep canonical geometry unchanged.
      new.width_px_u := old.width_px_u;
      new.height_px_u := old.height_px_u;
    end if;
  else
    -- INSERT path keeps existing deterministic bootstrap behavior.
    new.width_px_u := public.workspace_value_to_px_u(new.width_value, new.unit, new.artboard_dpi)::text;
    new.height_px_u := public.workspace_value_to_px_u(new.height_value, new.unit, new.artboard_dpi)::text;
  end if;

  w_u := new.width_px_u::bigint;
  h_u := new.height_px_u::bigint;

  w_px := greatest(1, ((w_u + 500000) / 1000000)::int);
  h_px := greatest(1, ((h_u + 500000) / 1000000)::int);

  new.width_px := w_px;
  new.height_px := h_px;
  return new;
end
$$;

drop trigger if exists trg_project_workspace_sync_px_cache on public.project_workspace;
create trigger trg_project_workspace_sync_px_cache
before insert or update on public.project_workspace
for each row execute function public.project_workspace_sync_px_cache();

-- =========================================================
-- db/029_project_images_dpi_optional.sql
-- =========================================================
-- gruf.io - Make project_images.dpi optional (output-only)
--
-- Goal:
-- - DPI must not be required for editor geometry (pixel-only editor)
-- - Allow uploads/seeding without a DPI value

alter table public.project_images
  drop constraint if exists project_images_dpi_gt_zero;

alter table public.project_images
  alter column dpi drop not null;

-- =========================================================
-- db/030_project_workspace_output_dpi.sql
-- =========================================================
-- gruf.io - Output-only DPI (separate from editor geometry)
--
-- Goal:
-- - Introduce `output_dpi` as the single output/export DPI (PDF/print)
-- - Keep editor geometry pixel-only (no DPI involvement)
-- - Bridge from legacy `artboard_dpi` during transition

alter table public.project_workspace
  add column if not exists output_dpi numeric;

update public.project_workspace
set output_dpi = coalesce(output_dpi, artboard_dpi, 300)
where output_dpi is null;

alter table public.project_workspace
  alter column output_dpi set default 300;

alter table public.project_workspace
  alter column output_dpi set not null;

alter table public.project_workspace
  drop constraint if exists project_workspace_output_dpi_positive;

alter table public.project_workspace
  add constraint project_workspace_output_dpi_positive check (output_dpi > 0);

-- =========================================================
-- db/031_project_workspace_px_u_canonical.sql
-- =========================================================
-- gruf.io - Canonical workspace geometry is width_px_u/height_px_u (pixel-only)
--
-- Goal:
-- - On UPDATE: never recompute `width_px_u/height_px_u` from width_value/unit/DPI
-- - Always derive cached integer px (`width_px/height_px`) from canonical µpx
-- - Keep INSERT backward-compatible: if µpx is missing, fall back to legacy value+unit+DPI bootstrap

create or replace function public.project_workspace_sync_px_cache()
returns trigger
language plpgsql
as $$
declare
  w_u bigint;
  h_u bigint;
  w_px int;
  h_px int;
begin
  if tg_op = 'UPDATE' then
    if new.width_px_u is null then new.width_px_u := old.width_px_u; end if;
    if new.height_px_u is null then new.height_px_u := old.height_px_u; end if;
  else
    if new.width_px_u is null then
      new.width_px_u := public.workspace_value_to_px_u(new.width_value, new.unit, new.artboard_dpi)::text;
    end if;
    if new.height_px_u is null then
      new.height_px_u := public.workspace_value_to_px_u(new.height_value, new.unit, new.artboard_dpi)::text;
    end if;
  end if;

  w_u := new.width_px_u::bigint;
  h_u := new.height_px_u::bigint;

  w_px := greatest(1, ((w_u + 500000) / 1000000)::int);
  h_px := greatest(1, ((h_u + 500000) / 1000000)::int);

  new.width_px := w_px;
  new.height_px := h_px;
  return new;
end
$$;

drop trigger if exists trg_project_workspace_sync_px_cache on public.project_workspace;
create trigger trg_project_workspace_sync_px_cache
before insert or update on public.project_workspace
for each row execute function public.project_workspace_sync_px_cache();

-- =========================================================
-- db/025_set_active_master_with_state_dpi_aligned.sql
-- =========================================================
-- gruf.io - Seed active-master image-state (pixel-only)
--
-- Purpose:
-- - Seed persisted size directly from image pixel dimensions (µpx = px * 1_000_000)
-- - Keep editor geometry pixel-only; DPI is output-only (PDF/export)

create or replace function public.set_active_master_with_state(
  p_project_id uuid,
  p_image_id uuid,
  p_width_px integer,
  p_height_px integer
)
returns void
language plpgsql
as $$
declare
  v_w_u bigint;
  v_h_u bigint;
  v_artboard_w_u bigint;
  v_artboard_h_u bigint;
begin
  -- Pixel-only size (µpx).
  v_w_u := greatest(1, p_width_px)::bigint * 1000000;
  v_h_u := greatest(1, p_height_px)::bigint * 1000000;

  update public.project_images
  set is_active = false
  where project_id = p_project_id
    and role = 'master'
    and deleted_at is null;

  update public.project_images
  set is_active = true
  where id = p_image_id
    and project_id = p_project_id
    and role = 'master'
    and deleted_at is null;

  select
    case
      when pw.width_px_u is not null then pw.width_px_u::bigint
      else greatest(1, pw.width_px)::bigint * 1000000
    end,
    case
      when pw.height_px_u is not null then pw.height_px_u::bigint
      else greatest(1, pw.height_px)::bigint * 1000000
    end
  into v_artboard_w_u, v_artboard_h_u
  from public.project_workspace pw
  where pw.project_id = p_project_id;

  if v_artboard_w_u is null then v_artboard_w_u := v_w_u; end if;
  if v_artboard_h_u is null then v_artboard_h_u := v_h_u; end if;

  insert into public.project_image_state (
    project_id,
    role,
    image_id,
    x_px_u,
    y_px_u,
    width_px_u,
    height_px_u,
    rotation_deg
  ) values (
    p_project_id,
    'master',
    p_image_id,
    (v_artboard_w_u / 2)::text,
    (v_artboard_h_u / 2)::text,
    v_w_u::text,
    v_h_u::text,
    0
  )
  on conflict (project_id, role)
  do update
    set image_id = excluded.image_id,
        x_px_u = excluded.x_px_u,
        y_px_u = excluded.y_px_u,
        width_px_u = excluded.width_px_u,
        height_px_u = excluded.height_px_u,
        rotation_deg = excluded.rotation_deg;
end;
$$;

alter table public.project_workspace
  alter column artboard_dpi set default 300;

alter table public.project_workspace
  alter column artboard_dpi set not null;

alter table public.project_workspace
  drop constraint if exists project_workspace_artboard_dpi_positive;

alter table public.project_workspace
  add constraint project_workspace_artboard_dpi_positive check (artboard_dpi > 0);

create or replace function public.project_workspace_sync_px_cache()
returns trigger
language plpgsql
as $$
declare
  w_u bigint;
  h_u bigint;
  w_px int;
  h_px int;
begin
  new.width_px_u := public.workspace_value_to_px_u(new.width_value, new.unit, new.artboard_dpi)::text;
  new.height_px_u := public.workspace_value_to_px_u(new.height_value, new.unit, new.artboard_dpi)::text;

  w_u := new.width_px_u::bigint;
  h_u := new.height_px_u::bigint;

  w_px := greatest(1, ((w_u + 500000) / 1000000)::int);
  h_px := greatest(1, ((h_u + 500000) / 1000000)::int);

  new.width_px := w_px;
  new.height_px := h_px;
  return new;
end
$$;

alter table public.project_workspace
  drop column if exists dpi_x,
  drop column if exists dpi_y,
  drop column if exists output_dpi_x,
  drop column if exists output_dpi_y;

-- =========================================================
-- db/024_project_workspace_recompute_px_from_artboard_dpi.sql
-- =========================================================
-- gruf.io - Recompute workspace px cache from canonical µpx
--
-- Goal:
-- - derive cached integer px from canonical `width_px_u` / `height_px_u`
-- - no DPI-based geometry recompute

update public.project_workspace
set
  width_px = greatest(1, (((width_px_u::bigint) + 500000) / 1000000)::int),
  height_px = greatest(1, (((height_px_u::bigint) + 500000) / 1000000)::int);

-- =========================================================
-- db/032_project_images_active_variant_contract.sql
-- =========================================================
-- gruf.io - Active-image contract + variant lineage fields
--
-- Purpose:
-- - Keep the initial master immutable (`role='master'`).
-- - Allow derived variants (`role='asset'`) to become the active working image.
-- - Add generic lineage (`source_image_id`) and crop metadata (`crop_rect_px`).
-- - Replace "one active master" with "one active image" per project.

alter table public.project_images
  add column if not exists source_image_id uuid,
  add column if not exists crop_rect_px jsonb;

-- Remove legacy uniqueness that allowed only one image per role.
-- Required for multiple derived variants (role='asset').
alter table public.project_images
  drop constraint if exists project_images_one_per_role,
  drop constraint if exists project_images_project_id_role_uidx,
  drop constraint if exists project_images_project_id_role_key;

drop index if exists public.project_images_project_id_role_uidx;
drop index if exists public.project_images_project_id_role_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_images_source_image_id_fkey'
      and conrelid = 'public.project_images'::regclass
  ) then
    alter table public.project_images
      add constraint project_images_source_image_id_fkey
      foreign key (source_image_id)
      references public.project_images(id)
      on delete restrict;
  end if;
end $$;

alter table public.project_images
  drop constraint if exists project_images_crop_rect_shape_ck,
  drop constraint if exists project_images_crop_rect_number_int_ck,
  drop constraint if exists project_images_crop_rect_value_ck,
  drop constraint if exists project_images_crop_rect_requires_source_ck,
  drop constraint if exists project_images_derived_role_ck;

alter table public.project_images
  add constraint project_images_crop_rect_shape_ck check (
    crop_rect_px is null
    or (
      jsonb_typeof(crop_rect_px) = 'object'
      and crop_rect_px ?& array['x', 'y', 'w', 'h']
      and (crop_rect_px - 'x' - 'y' - 'w' - 'h') = '{}'::jsonb
    )
  ),
  add constraint project_images_crop_rect_number_int_ck check (
    crop_rect_px is null
    or (
      jsonb_typeof(crop_rect_px->'x') = 'number'
      and jsonb_typeof(crop_rect_px->'y') = 'number'
      and jsonb_typeof(crop_rect_px->'w') = 'number'
      and jsonb_typeof(crop_rect_px->'h') = 'number'
      and ((crop_rect_px->>'x')::numeric % 1) = 0
      and ((crop_rect_px->>'y')::numeric % 1) = 0
      and ((crop_rect_px->>'w')::numeric % 1) = 0
      and ((crop_rect_px->>'h')::numeric % 1) = 0
    )
  ),
  add constraint project_images_crop_rect_value_ck check (
    crop_rect_px is null
    or (
      (crop_rect_px->>'x')::integer >= 0
      and (crop_rect_px->>'y')::integer >= 0
      and (crop_rect_px->>'w')::integer >= 10
      and (crop_rect_px->>'h')::integer >= 10
    )
  ),
  add constraint project_images_crop_rect_requires_source_ck check (
    crop_rect_px is null or source_image_id is not null
  ),
  add constraint project_images_derived_role_ck check (
    source_image_id is null or role = 'asset'
  );

drop index if exists project_images_one_active_master_idx;

create unique index if not exists project_images_one_active_image_idx
  on public.project_images (project_id)
  where is_active is true and deleted_at is null;

create or replace function public.set_active_image(
  p_project_id uuid,
  p_image_id uuid
)
returns void
language plpgsql
as $$
begin
  update public.project_images
  set is_active = false
  where project_id = p_project_id
    and deleted_at is null;

  update public.project_images
  set is_active = true
  where id = p_image_id
    and project_id = p_project_id
    and deleted_at is null;
end;
$$;

create or replace function public.set_active_master_image(p_project_id uuid, p_image_id uuid)
returns void
language plpgsql
as $$
begin
  perform public.set_active_image(p_project_id, p_image_id);
end;
$$;

create or replace function public.set_active_master_latest(p_project_id uuid)
returns void
language plpgsql
as $$
declare
  v_image_id uuid;
begin
  select id
  into v_image_id
  from public.project_images
  where project_id = p_project_id
    and deleted_at is null
  order by created_at desc
  limit 1;

  if v_image_id is not null then
    perform public.set_active_image(p_project_id, v_image_id);
  end if;
end;
$$;

create or replace function public.set_active_master_with_state(
  p_project_id uuid,
  p_image_id uuid,
  p_width_px integer,
  p_height_px integer
)
returns void
language plpgsql
as $$
declare
  v_w_u bigint;
  v_h_u bigint;
  v_artboard_w_u bigint;
  v_artboard_h_u bigint;
begin
  v_w_u := greatest(1, p_width_px)::bigint * 1000000;
  v_h_u := greatest(1, p_height_px)::bigint * 1000000;

  perform public.set_active_image(p_project_id, p_image_id);

  select
    case
      when pw.width_px_u is not null then pw.width_px_u::bigint
      else greatest(1, pw.width_px)::bigint * 1000000
    end,
    case
      when pw.height_px_u is not null then pw.height_px_u::bigint
      else greatest(1, pw.height_px)::bigint * 1000000
    end
  into v_artboard_w_u, v_artboard_h_u
  from public.project_workspace pw
  where pw.project_id = p_project_id;

  if v_artboard_w_u is null then v_artboard_w_u := v_w_u; end if;
  if v_artboard_h_u is null then v_artboard_h_u := v_h_u; end if;

  insert into public.project_image_state (
    project_id,
    role,
    image_id,
    x_px_u,
    y_px_u,
    width_px_u,
    height_px_u,
    rotation_deg
  ) values (
    p_project_id,
    'master',
    p_image_id,
    (v_artboard_w_u / 2)::text,
    (v_artboard_h_u / 2)::text,
    v_w_u::text,
    v_h_u::text,
    0
  )
  on conflict (project_id, role)
  do update
    set image_id = excluded.image_id,
        x_px_u = excluded.x_px_u,
        y_px_u = excluded.y_px_u,
        width_px_u = excluded.width_px_u,
        height_px_u = excluded.height_px_u,
        rotation_deg = excluded.rotation_deg;
end;
$$;

-- =========================================================
-- db/033_project_images_lock_state.sql
-- =========================================================
-- gruf.io - Persisted lock state for project images
--
-- Purpose:
-- - Persist the editor lock/unlock state per image in DB.
-- - Enable consistent lock behavior across sessions/devices.

alter table public.project_images
  add column if not exists is_locked boolean not null default false;

-- =========================================================
-- db/034_function_search_path_hardening.sql
-- =========================================================
-- gruf.io - Harden function search_path for security lint 0011
--
-- Purpose:
-- - Prevent mutable role-dependent name resolution inside SQL/plpgsql functions.
-- - Keep behavior unchanged; only pin schema lookup path.

alter function public.set_active_image(uuid, uuid)
  set search_path = public, pg_temp;

alter function public.set_active_master_image(uuid, uuid)
  set search_path = public, pg_temp;

-- =========================================================
-- Marker sync for migrations managed in db/ after bootstrap cut
-- =========================================================
-- db/038_project_image_filters_remove_grayscale.sql
-- db/039_cascade_delete_derived_images.sql
-- db/040_allow_master_image_delete.sql
-- db/041_add_image_dpi_columns.sql
-- db/042_dpi_based_initial_scale.sql
-- db/043_image_state_per_image.sql
-- db/043_reconcile_image_state_contract.sql
-- db/044_cleanup_duplicate_fks.sql
-- db/045_cleanup_null_image_ids.sql
-- db/046_fix_set_active_master_pk.sql
-- db/047_force_cleanup_and_fix_function.sql
-- db/048_reconcile_image_state_fk_and_master_state.sql
-- db/049_enable_project_image_filters.sql
-- db/050_atomic_filter_chain_append.sql
-- db/051_canonical_set_active_master_with_state.sql
-- db/052_reinforce_master_immutable_contract.sql
-- db/053_collect_transitive_delete_targets.sql

-- =========================================================
-- db/037_master_variant_filter_contract.sql
-- =========================================================
-- gruf.io - Master / Variant / Filter contract hardening

create unique index if not exists project_images_one_master_per_project_idx
  on public.project_images (project_id)
  where role = 'master' and deleted_at is null;

alter table public.project_images
  drop constraint if exists project_images_master_no_source_ck;

alter table public.project_images
  add constraint project_images_master_no_source_ck
  check (role <> 'master' or source_image_id is null);

alter table public.project_images
  drop constraint if exists project_images_asset_requires_source_ck;

alter table public.project_images
  add constraint project_images_asset_requires_source_ck
  check (role <> 'asset' or source_image_id is not null) not valid;

create or replace function public.guard_master_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.role = 'master' then
    raise exception using
      message = 'master image is immutable',
      detail = format('project_id=%s image_id=%s', old.project_id, old.id),
      hint = 'Use restore/activation flow instead of deleting the master image.';
  end if;

  if tg_op = 'UPDATE' and old.role = 'master' then
    if new.name is distinct from old.name
       or new.format is distinct from old.format
       or new.width_px is distinct from old.width_px
       or new.height_px is distinct from old.height_px
       or new.storage_bucket is distinct from old.storage_bucket
       or new.storage_path is distinct from old.storage_path
       or new.file_size_bytes is distinct from old.file_size_bytes
       or new.source_image_id is distinct from old.source_image_id
       or new.crop_rect_px is distinct from old.crop_rect_px
       or new.role is distinct from old.role
       or new.deleted_at is distinct from old.deleted_at then
      raise exception using
        message = 'master image is immutable',
        detail = format('project_id=%s image_id=%s', old.project_id, old.id),
        hint = 'Only active pointer changes are allowed for master image rows.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter function public.guard_master_immutable()
  set search_path = public, pg_temp;

drop trigger if exists trg_project_images_guard_master_immutable on public.project_images;
create trigger trg_project_images_guard_master_immutable
before update or delete on public.project_images
for each row execute function public.guard_master_immutable();

drop policy if exists project_images_owner_all on public.project_images;
drop policy if exists project_images_owner_select on public.project_images;
drop policy if exists project_images_owner_insert on public.project_images;
drop policy if exists project_images_owner_update on public.project_images;
drop policy if exists project_images_owner_delete_non_master on public.project_images;

create policy project_images_owner_select
on public.project_images for select
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

create policy project_images_owner_insert
on public.project_images for insert
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

create policy project_images_owner_update
on public.project_images for update
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
)
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

create policy project_images_owner_delete_non_master
on public.project_images for delete
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
  and role <> 'master'
);

create table if not exists public.project_image_filters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  input_image_id uuid not null references public.project_images(id) on delete restrict,
  output_image_id uuid not null references public.project_images(id) on delete restrict,
  filter_type text not null,
  filter_params jsonb not null default '{}'::jsonb,
  stack_order integer not null check (stack_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_image_filters_project_stack_order_uidx unique (project_id, stack_order),
  constraint project_image_filters_output_unique unique (output_image_id),
  constraint project_image_filters_input_not_output_ck check (input_image_id <> output_image_id)
);

create index if not exists project_image_filters_project_order_idx
  on public.project_image_filters (project_id, stack_order);

create index if not exists project_image_filters_input_image_idx
  on public.project_image_filters (input_image_id);

create index if not exists project_image_filters_output_image_idx
  on public.project_image_filters (output_image_id);

drop trigger if exists trg_project_image_filters_updated_at on public.project_image_filters;
create trigger trg_project_image_filters_updated_at
before update on public.project_image_filters
for each row execute function public.set_updated_at();

alter table public.project_image_filters enable row level security;

drop policy if exists project_image_filters_owner_all on public.project_image_filters;
drop policy if exists project_image_filters_owner_select on public.project_image_filters;
drop policy if exists project_image_filters_owner_insert on public.project_image_filters;
drop policy if exists project_image_filters_owner_update on public.project_image_filters;
drop policy if exists project_image_filters_owner_delete on public.project_image_filters;

create policy project_image_filters_owner_select
on public.project_image_filters for select
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

create policy project_image_filters_owner_insert
on public.project_image_filters for insert
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

create policy project_image_filters_owner_update
on public.project_image_filters for update
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
)
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

create policy project_image_filters_owner_delete
on public.project_image_filters for delete
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

alter function public.set_active_master_latest(uuid)
  set search_path = public, pg_temp;

alter function public.set_active_master_with_state(uuid, uuid, integer, integer)
  set search_path = public, pg_temp;

alter function public.project_workspace_sync_px_cache()
  set search_path = public, pg_temp;

-- =========================================================
-- db/035_remove_artboard_dpi_and_harden_workspace_insert.sql
-- =========================================================
-- gruf.io - Remove artboard_dpi and harden workspace INSERT contract
--
-- Goal:
-- - remove legacy `artboard_dpi` from runtime schema
-- - enforce canonical geometry on INSERT (`width_px_u`/`height_px_u` required)
-- - keep UPDATE path geometry-stable (no DPI/value/unit recompute)

alter table public.project_workspace
  add column if not exists output_dpi numeric;

update public.project_workspace
set output_dpi = coalesce(output_dpi, 300)
where output_dpi is null;

alter table public.project_workspace
  alter column output_dpi set default 300;

alter table public.project_workspace
  alter column output_dpi set not null;

alter table public.project_workspace
  drop constraint if exists project_workspace_output_dpi_positive;

alter table public.project_workspace
  add constraint project_workspace_output_dpi_positive check (output_dpi > 0);

create or replace function public.project_workspace_sync_px_cache()
returns trigger
language plpgsql
as $$
declare
  w_u bigint;
  h_u bigint;
begin
  if tg_op = 'UPDATE' then
    if new.width_px_u is null then new.width_px_u := old.width_px_u; end if;
    if new.height_px_u is null then new.height_px_u := old.height_px_u; end if;
  else
    if new.width_px_u is null or new.height_px_u is null then
      raise exception using
        message = 'project_workspace INSERT requires width_px_u and height_px_u',
        hint = 'Provide canonical micro-pixel geometry explicitly.';
    end if;
  end if;

  w_u := new.width_px_u::bigint;
  h_u := new.height_px_u::bigint;

  new.width_px := greatest(1, ((w_u + 500000) / 1000000)::int);
  new.height_px := greatest(1, ((h_u + 500000) / 1000000)::int);
  return new;
end
$$;

alter function public.project_workspace_sync_px_cache()
  set search_path = public, pg_temp;

drop trigger if exists trg_project_workspace_sync_px_cache on public.project_workspace;
create trigger trg_project_workspace_sync_px_cache
before insert or update on public.project_workspace
for each row execute function public.project_workspace_sync_px_cache();

alter table public.project_workspace
  alter column width_px_u set not null,
  alter column height_px_u set not null;

alter table public.project_workspace
  drop constraint if exists project_workspace_width_px_u_positive,
  drop constraint if exists project_workspace_height_px_u_positive,
  drop constraint if exists project_workspace_px_cache_consistency;

alter table public.project_workspace
  add constraint project_workspace_width_px_u_positive check ((width_px_u::bigint) >= 1000000 and (width_px_u::bigint) <= 32768000000),
  add constraint project_workspace_height_px_u_positive check ((height_px_u::bigint) >= 1000000 and (height_px_u::bigint) <= 32768000000),
  add constraint project_workspace_px_cache_consistency check (
    width_px = greatest(1, (((width_px_u::bigint) + 500000) / 1000000)::int) and
    height_px = greatest(1, (((height_px_u::bigint) + 500000) / 1000000)::int)
  );

alter table public.project_workspace
  drop constraint if exists project_workspace_artboard_dpi_positive;

alter table public.project_workspace
  drop column if exists artboard_dpi;

-- =========================================================
-- db/036_set_active_image_hardening.sql
-- =========================================================
-- gruf.io - Harden active-image mutation functions
--
-- Goal:
-- - Ensure active-image switch fails loudly for invalid targets.
-- - Keep exactly one active non-deleted image per project.
-- - Pin function search_path for security linting.

create or replace function public.set_active_image(
  p_project_id uuid,
  p_image_id uuid
)
returns void
language plpgsql
as $$
declare
  v_target_exists boolean;
begin
  select exists (
    select 1
    from public.project_images pi
    where pi.id = p_image_id
      and pi.project_id = p_project_id
      and pi.deleted_at is null
  )
  into v_target_exists;

  if not v_target_exists then
    raise exception using
      message = 'set_active_image target not found',
      detail = format('project_id=%s image_id=%s', p_project_id, p_image_id),
      hint = 'Ensure the image belongs to the project and is not deleted.';
  end if;

  update public.project_images
  set is_active = false
  where project_id = p_project_id
    and deleted_at is null;

  update public.project_images
  set is_active = true
  where id = p_image_id
    and project_id = p_project_id
    and deleted_at is null;
end;
$$;

alter function public.set_active_image(uuid, uuid)
  set search_path = public, pg_temp;

create or replace function public.set_active_master_image(p_project_id uuid, p_image_id uuid)
returns void
language plpgsql
as $$
begin
  perform public.set_active_image(p_project_id, p_image_id);
end;
$$;

alter function public.set_active_master_image(uuid, uuid)
  set search_path = public, pg_temp;

