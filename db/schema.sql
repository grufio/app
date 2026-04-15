-- gruf.io Combined Schema
--
-- Canonical migration history is `supabase/migrations/`.
-- This file is the derived runnable snapshot for auditability and SQL-editor fallback.
-- Historical numbered files are archived in `db/_archive/`.

-- =========================================================
-- BEGIN db/001_init.sql
-- =========================================================
-- gruf.io MVP Database Schema (Supabase Postgres)
-- Scope: Editor-only (owner_id) for now. Sharing/reviewer via link is handled later.
--
-- Key requirements implemented:
-- - Users can have unlimited projects (projects.owner_id -> auth.users.id)
-- - Each project has exactly 1 Master image + exactly 1 Working copy (UNIQUE(project_id, role))
-- - Store DPI and PX separately
-- - Workspace modeled Illustrator-like: unit + width_value/height_value + dpi + cached width_px/height_px
-- - PDFs: unlimited per project, numbered, stored as file objects (storage_path) with metadata in DB
--
-- Notes:
-- - This schema stores binary files in Supabase Storage (referenced by storage_path).
-- - All structured data is stored in Postgres with RLS owner-only policies.

-- Extensions
create extension if not exists pgcrypto;

-- Enums
do $$ begin
  create type public.project_status as enum ('in_progress', 'completed', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.image_role as enum ('master', 'working');
exception when duplicate_object then null; end $$;

-- Illustrator-like UI units (not DPI)
do $$ begin
  create type public.measure_unit as enum ('mm', 'cm', 'pt', 'px');
exception when duplicate_object then null; end $$;

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

-- =========================
-- Tables
-- =========================

-- Projects
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status public.project_status not null default 'in_progress',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_owner_id_idx on public.projects(owner_id);

-- =========================================================
-- BEGIN db/014_projects_owner_updated_at_idx.sql
-- =========================================================
-- Optimize dashboard project list ordering for per-owner queries.
create index if not exists projects_owner_updated_at_idx
on public.projects (owner_id, updated_at desc);
-- =========================================================
-- END db/014_projects_owner_updated_at_idx.sql
-- =========================================================

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

-- Images (exactly one master + one working per project)
create table if not exists public.project_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  role public.image_role not null,

  -- metadata
  name text not null,
  format text not null, -- "jpeg", "png", ...
  width_px integer not null check (width_px > 0),
  height_px integer not null check (height_px > 0),
  dpi_x numeric not null check (dpi_x > 0),
  dpi_y numeric not null check (dpi_y > 0),
  bit_depth integer not null check (bit_depth > 0),

  -- file reference (Supabase Storage path)
  storage_path text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_images_one_per_role unique (project_id, role)
);

create index if not exists project_images_project_id_idx on public.project_images(project_id);

drop trigger if exists trg_project_images_updated_at on public.project_images;
create trigger trg_project_images_updated_at
before update on public.project_images
for each row execute function public.set_updated_at();

-- Workspace (Artboard) - Illustrator-like
create table if not exists public.project_workspace (
  project_id uuid primary key references public.projects(id) on delete cascade,

  -- UI/editing unit for width_value/height_value
  unit public.measure_unit not null default 'mm',

  -- UI/editing values (display inputs). Canonical truth is µpx (see width_px_u/height_px_u).
  width_value numeric not null check (width_value > 0),
  height_value numeric not null check (height_value > 0),

  -- resolution stored separately (legacy)
  dpi_x numeric not null check (dpi_x > 0),
  dpi_y numeric not null check (dpi_y > 0),

  -- output/export resolution (Illustrator-style)
  output_dpi_x numeric not null default 300 check (output_dpi_x > 0),
  output_dpi_y numeric not null default 300 check (output_dpi_y > 0),

  -- canonical µpx size (fixed-point integers stored as strings)
  width_px_u text,
  height_px_u text,

  -- cached/derived pixel size
  width_px integer not null check (width_px > 0),
  height_px integer not null check (height_px > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_project_workspace_updated_at on public.project_workspace;
create trigger trg_project_workspace_updated_at
before update on public.project_workspace
for each row execute function public.set_updated_at();

-- Grid (Raster) - optional per project
create table if not exists public.project_grid (
  project_id uuid primary key references public.projects(id) on delete cascade,
  color text not null,              -- e.g. "#RRGGBB"
  spacing_value numeric not null check (spacing_value > 0),
  line_width_value numeric not null check (line_width_value > 0),
  unit public.measure_unit not null default 'mm', -- unit for spacing/line width (UI-level)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_project_grid_updated_at on public.project_grid;
create trigger trg_project_grid_updated_at
before update on public.project_grid
for each row execute function public.set_updated_at();

-- =========================================================
-- BEGIN db/007_project_image_state.sql
-- =========================================================
-- Persist editor "working copy" image transform (position/scale/rotation)
create table if not exists public.project_image_state (
  project_id uuid not null references public.projects(id) on delete cascade,
  role public.image_role not null,

  x numeric not null default 0,
  y numeric not null default 0,
  scale_x numeric not null default 1 check (scale_x > 0),
  scale_y numeric not null default 1 check (scale_y > 0),
  rotation_deg integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_image_state_pk primary key (project_id, role)
);

drop trigger if exists trg_project_image_state_updated_at on public.project_image_state;
create trigger trg_project_image_state_updated_at
before update on public.project_image_state
for each row execute function public.set_updated_at();

alter table public.project_image_state enable row level security;

drop policy if exists project_image_state_owner_all on public.project_image_state;
create policy project_image_state_owner_all
on public.project_image_state for all
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
);
-- =========================================================
-- END db/007_project_image_state.sql
-- =========================================================

-- =========================================================
-- BEGIN db/008_project_image_state_size.sql
-- =========================================================
-- Persist editor working image size (px) alongside transform
alter table public.project_image_state
  add column if not exists width_px numeric,
  add column if not exists height_px numeric;

alter table public.project_image_state
  drop constraint if exists project_image_state_width_px_positive;
alter table public.project_image_state
  add constraint project_image_state_width_px_positive check (width_px is null or width_px > 0);

alter table public.project_image_state
  drop constraint if exists project_image_state_height_px_positive;
alter table public.project_image_state
  add constraint project_image_state_height_px_positive check (height_px is null or height_px > 0);
-- =========================================================
-- END db/008_project_image_state_size.sql
-- =========================================================

-- =========================================================
-- BEGIN db/009_project_image_state_meta.sql
-- =========================================================
-- Persist image display meta (unit + dpi) on image state
alter table public.project_image_state
  add column if not exists unit public.measure_unit,
  add column if not exists dpi numeric;

alter table public.project_image_state
  drop constraint if exists project_image_state_dpi_positive;
alter table public.project_image_state
  add constraint project_image_state_dpi_positive check (dpi is null or dpi > 0);
-- =========================================================
-- END db/009_project_image_state_meta.sql
-- =========================================================

-- =========================================================
-- BEGIN db/011_project_image_state_micro_px.sql
-- =========================================================
-- Persist image state in µpx (string BigInt)
alter table public.project_image_state
  add column if not exists width_px_u text,
  add column if not exists height_px_u text,
  add column if not exists x_px_u text,
  add column if not exists y_px_u text;
-- =========================================================
-- END db/011_project_image_state_micro_px.sql
-- =========================================================

-- =========================================================
-- BEGIN db/012_project_grid_xy.sql
-- =========================================================
-- gruf.io - Grid spacing X/Y (MVP)
-- Adds independent grid spacing for X and Y axes.

alter table public.project_grid
  add column if not exists spacing_x_value numeric,
  add column if not exists spacing_y_value numeric;

-- Backfill existing single spacing_value into both axes.
update public.project_grid
set
  spacing_x_value = coalesce(spacing_x_value, spacing_value),
  spacing_y_value = coalesce(spacing_y_value, spacing_value)
where spacing_x_value is null or spacing_y_value is null;

alter table public.project_grid
  drop constraint if exists project_grid_spacing_x_positive;
alter table public.project_grid
  add constraint project_grid_spacing_x_positive check (spacing_x_value is null or spacing_x_value > 0);

alter table public.project_grid
  drop constraint if exists project_grid_spacing_y_positive;
alter table public.project_grid
  add constraint project_grid_spacing_y_positive check (spacing_y_value is null or spacing_y_value > 0);

alter table public.project_grid
  alter column spacing_x_value set not null,
  alter column spacing_y_value set not null;

alter table public.project_grid
  drop constraint if exists project_grid_spacing_x_positive;
alter table public.project_grid
  add constraint project_grid_spacing_x_positive check (spacing_x_value > 0);

alter table public.project_grid
  drop constraint if exists project_grid_spacing_y_positive;
alter table public.project_grid
  add constraint project_grid_spacing_y_positive check (spacing_y_value > 0);

create or replace function public.project_grid_sync_spacing_legacy()
returns trigger
language plpgsql
as $$
begin
  if new.spacing_x_value is null then
    new.spacing_x_value := new.spacing_value;
  end if;

  if new.spacing_y_value is null then
    new.spacing_y_value := new.spacing_value;
  end if;

  new.spacing_value := new.spacing_x_value;
  return new;
end
$$;

drop trigger if exists trg_project_grid_sync_spacing_legacy on public.project_grid;
create trigger trg_project_grid_sync_spacing_legacy
before insert or update on public.project_grid
for each row execute function public.project_grid_sync_spacing_legacy();

-- =========================================================
-- END db/012_project_grid_xy.sql
-- =========================================================

-- =========================================================
-- BEGIN db/010_project_workspace_raster_preset.sql
-- =========================================================
-- Persist artboard raster effects quality preset (Illustrator-like)
alter table public.project_workspace
  add column if not exists raster_effects_preset text;

alter table public.project_workspace
  drop constraint if exists project_workspace_raster_effects_preset_check;
alter table public.project_workspace
  add constraint project_workspace_raster_effects_preset_check
  check (raster_effects_preset is null or raster_effects_preset in ('high', 'medium', 'low'));
-- =========================================================
-- END db/010_project_workspace_raster_preset.sql
-- =========================================================

-- =========================================================
-- BEGIN db/013_project_workspace_micro_px.sql
-- =========================================================
-- gruf.io - Canonical workspace sizing in µpx (micro-pixels)
--
-- See `db/013_project_workspace_micro_px.sql` for rationale.
create or replace function public.workspace_value_to_px_u(v numeric, u public.measure_unit, dpi numeric)
returns bigint
language sql
immutable
as $$
  select case u
    when 'px' then round(v * 1000000)::bigint
    when 'mm' then round((v * dpi * 1000000) / 25.4)::bigint
    when 'cm' then round(((v * 10) * dpi * 1000000) / 25.4)::bigint
    when 'pt' then round((v * dpi * 1000000) / 72)::bigint
    else null
  end
$$;

alter table public.project_workspace
  add column if not exists width_px_u text,
  add column if not exists height_px_u text;

do $$
begin
  -- Idempotency guard:
  -- `dpi_x/dpi_y` are dropped later by db/023. If this schema is re-run against an already-migrated DB,
  -- referencing them would error. In that case, keep existing canonical µpx values as-is.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_workspace'
      and column_name = 'dpi_x'
  ) then
    update public.project_workspace
    set
      width_px_u = coalesce(width_px_u, public.workspace_value_to_px_u(width_value, unit, dpi_x)::text),
      height_px_u = coalesce(height_px_u, public.workspace_value_to_px_u(height_value, unit, dpi_y)::text)
    where width_px_u is null or height_px_u is null;
  end if;
end $$;

alter table public.project_workspace
  drop constraint if exists workspace_px_consistency;

do $workspace_sync_px_cache$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_workspace'
      and column_name = 'dpi_x'
  ) then
    execute $fn$
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
        if new.width_px_u is null then
          new.width_px_u := public.workspace_value_to_px_u(new.width_value, new.unit, new.dpi_x)::text;
        end if;
        if new.height_px_u is null then
          new.height_px_u := public.workspace_value_to_px_u(new.height_value, new.unit, new.dpi_y)::text;
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
    $fn$;
  else
    -- Already-migrated DB: keep canonical µpx stable; derive cached px from it.
    execute $fn$
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
          if new.width_px_u is null then new.width_px_u := (greatest(1, new.width_px)::bigint * 1000000)::text; end if;
          if new.height_px_u is null then new.height_px_u := (greatest(1, new.height_px)::bigint * 1000000)::text; end if;
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
    $fn$;
  end if;
end $workspace_sync_px_cache$;

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
-- =========================================================
-- END db/013_project_workspace_micro_px.sql
-- =========================================================

-- =========================================================
-- BEGIN db/016_project_workspace_page_bg.sql
-- =========================================================
-- gruf.io - Persist editor "Page" background
--
-- These settings are editor/workspace-level and must survive reloads.
-- Store them on `project_workspace` (not on image-state).

alter table public.project_workspace
  add column if not exists page_bg_enabled boolean default false,
  add column if not exists page_bg_color text default '#ffffff',
  add column if not exists page_bg_opacity integer default 50;

-- Backfill for existing rows (safe if columns already existed).
update public.project_workspace
set
  page_bg_enabled = coalesce(page_bg_enabled, false),
  page_bg_color = coalesce(page_bg_color, '#ffffff'),
  page_bg_opacity = coalesce(page_bg_opacity, 50)
where page_bg_enabled is null or page_bg_color is null or page_bg_opacity is null;

alter table public.project_workspace
  alter column page_bg_enabled set not null,
  alter column page_bg_color set not null,
  alter column page_bg_opacity set not null;

alter table public.project_workspace
  drop constraint if exists project_workspace_page_bg_color_hex,
  drop constraint if exists project_workspace_page_bg_opacity_pct;

alter table public.project_workspace
  add constraint project_workspace_page_bg_color_hex check (page_bg_color ~ '^#([0-9a-fA-F]{6})$'),
  add constraint project_workspace_page_bg_opacity_pct check (page_bg_opacity between 0 and 100);

-- =========================================================
-- END db/016_project_workspace_page_bg.sql
-- =========================================================

-- =========================================================
-- BEGIN db/018_project_workspace_output_dpi.sql
-- =========================================================
-- gruf.io - Output DPI stored separately from geometry
--
-- Purpose:
-- - Keep artboard geometry stable (Illustrator-style)
-- - Store output/export DPI separately

alter table public.project_workspace
  add column if not exists output_dpi_x numeric,
  add column if not exists output_dpi_y numeric;

-- Backfill existing rows (use current dpi as output reference).
do $backfill_output_dpi_xy$
begin
  -- This schema may be re-run against a DB where legacy columns were already dropped.
  -- Avoid hard references to columns that might not exist.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_workspace'
      and column_name = 'dpi_x'
  ) then
    execute '
      update public.project_workspace
      set
        output_dpi_x = coalesce(output_dpi_x, dpi_x, 300),
        output_dpi_y = coalesce(output_dpi_y, dpi_y, 300)
      where output_dpi_x is null or output_dpi_y is null
    ';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_workspace'
      and column_name = 'output_dpi'
  ) then
    execute '
      update public.project_workspace
      set
        output_dpi_x = coalesce(output_dpi_x, output_dpi, 300),
        output_dpi_y = coalesce(output_dpi_y, output_dpi, 300)
      where output_dpi_x is null or output_dpi_y is null
    ';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_workspace'
      and column_name = 'artboard_dpi'
  ) then
    execute '
      update public.project_workspace
      set
        output_dpi_x = coalesce(output_dpi_x, artboard_dpi, 300),
        output_dpi_y = coalesce(output_dpi_y, artboard_dpi, 300)
      where output_dpi_x is null or output_dpi_y is null
    ';
  else
    execute '
      update public.project_workspace
      set
        output_dpi_x = coalesce(output_dpi_x, 300),
        output_dpi_y = coalesce(output_dpi_y, 300)
      where output_dpi_x is null or output_dpi_y is null
    ';
  end if;
end
$backfill_output_dpi_xy$;

-- Defaults + constraints.
alter table public.project_workspace
  alter column output_dpi_x set default 300,
  alter column output_dpi_y set default 300;

alter table public.project_workspace
  alter column output_dpi_x set not null,
  alter column output_dpi_y set not null;

alter table public.project_workspace
  drop constraint if exists project_workspace_output_dpi_x_positive,
  drop constraint if exists project_workspace_output_dpi_y_positive;

alter table public.project_workspace
  add constraint project_workspace_output_dpi_x_positive check (output_dpi_x > 0),
  add constraint project_workspace_output_dpi_y_positive check (output_dpi_y > 0);

-- =========================================================
-- END db/018_project_workspace_output_dpi.sql
-- =========================================================

-- =========================================================
-- BEGIN db/019_project_images_multi.sql
-- =========================================================
-- gruf.io - Support multiple images per project
-- Adds role expansion, active master, storage metadata, indexes, and optional soft delete.

-- Extend image_role enum (do not remove existing values)
do $$ begin
  alter type public.image_role add value 'asset';
exception when duplicate_object then null; end $$;

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
-- END db/019_project_images_multi.sql
-- =========================================================

-- =========================================================
-- BEGIN db/020_project_images_storage_path.sql
-- =========================================================
-- gruf.io - Update storage policies for new image paths
-- Path convention: projects/<project_id>/images/<image_id>

alter table storage.objects enable row level security;

drop policy if exists project_images_storage_select_owner on storage.objects;
create policy project_images_storage_select_owner
on storage.objects for select
using (
  bucket_id = 'project_images'
  and (
    name ~ '^projects/[0-9a-fA-F-]{36}/images/[0-9a-fA-F-]{36}$'
    or name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  )
  and exists (
    select 1
    from public.projects p
    where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
      and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_storage_insert_owner on storage.objects;
create policy project_images_storage_insert_owner
on storage.objects for insert
with check (
  bucket_id = 'project_images'
  and (
    name ~ '^projects/[0-9a-fA-F-]{36}/images/[0-9a-fA-F-]{36}$'
    or name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  )
  and exists (
    select 1
    from public.projects p
    where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
      and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_storage_update_owner on storage.objects;
create policy project_images_storage_update_owner
on storage.objects for update
using (
  bucket_id = 'project_images'
  and (
    name ~ '^projects/[0-9a-fA-F-]{36}/images/[0-9a-fA-F-]{36}$'
    or name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  )
  and exists (
    select 1
    from public.projects p
    where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
      and p.owner_id = auth.uid()
  )
)
with check (
  bucket_id = 'project_images'
  and (
    name ~ '^projects/[0-9a-fA-F-]{36}/images/[0-9a-fA-F-]{36}$'
    or name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  )
  and exists (
    select 1
    from public.projects p
    where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
      and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_storage_delete_owner on storage.objects;
create policy project_images_storage_delete_owner
on storage.objects for delete
using (
  bucket_id = 'project_images'
  and (
    name ~ '^projects/[0-9a-fA-F-]{36}/images/[0-9a-fA-F-]{36}$'
    or name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  )
  and exists (
    select 1
    from public.projects p
    where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
      and p.owner_id = auth.uid()
  )
);

-- =========================================================
-- END db/020_project_images_storage_path.sql
-- =========================================================

-- =========================================================
-- BEGIN db/017_schema_migrations.sql
-- =========================================================
-- gruf.io - Track applied SQL migrations (optional)
--
-- Supabase SQL editor runs are not automatically tracked for custom migrations.
-- This table provides a lightweight, auditable record of what was applied.

create table if not exists public.schema_migrations (
  id bigserial primary key,
  filename text not null,
  checksum_sha256 text not null,
  applied_at timestamptz not null default now(),
  constraint schema_migrations_filename_unique unique (filename)
);

-- =========================================================
-- END db/017_schema_migrations.sql
-- =========================================================

-- Vectorization settings (Bitmap -> vectors) - optional per project
create table if not exists public.project_vectorization_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  num_colors integer not null check (num_colors between 1 and 1000),
  output_width_px integer not null check (output_width_px > 0),
  output_height_px integer not null check (output_height_px > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_project_vec_updated_at on public.project_vectorization_settings;
create trigger trg_project_vec_updated_at
before update on public.project_vectorization_settings
for each row execute function public.set_updated_at();

-- PDFs (unlimited per project)
create table if not exists public.project_pdfs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,

  sequence_number integer not null check (sequence_number > 0),
  filename text not null, -- project name + running number

  -- file reference (Supabase Storage path)
  storage_path text not null,

  -- output snapshot
  pdf_format text not null, -- "A4", "Letter", ...
  output_dpi_x numeric not null check (output_dpi_x > 0),
  output_dpi_y numeric not null check (output_dpi_y > 0),
  output_line_width_value numeric not null check (output_line_width_value > 0),
  output_line_width_unit public.measure_unit not null default 'mm',

  created_at timestamptz not null default now(),

  constraint project_pdfs_sequence_unique unique (project_id, sequence_number)
);

create index if not exists project_pdfs_project_id_idx on public.project_pdfs(project_id);

-- =========================
-- Row Level Security (Owner-only MVP)
-- =========================

alter table public.projects enable row level security;
alter table public.project_images enable row level security;
alter table public.project_workspace enable row level security;
alter table public.project_grid enable row level security;
alter table public.project_vectorization_settings enable row level security;
alter table public.project_pdfs enable row level security;

-- projects: owner-only
drop policy if exists projects_select_owner on public.projects;
create policy projects_select_owner
on public.projects for select
using (owner_id = auth.uid());

drop policy if exists projects_insert_owner on public.projects;
create policy projects_insert_owner
on public.projects for insert
with check (owner_id = auth.uid());

drop policy if exists projects_update_owner on public.projects;
create policy projects_update_owner
on public.projects for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists projects_delete_owner on public.projects;
create policy projects_delete_owner
on public.projects for delete
using (owner_id = auth.uid());

-- child tables: owner-only via parent project

drop policy if exists project_images_owner_all on public.project_images;
create policy project_images_owner_all
on public.project_images for all
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
);

drop policy if exists project_workspace_owner_all on public.project_workspace;
create policy project_workspace_owner_all
on public.project_workspace for all
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
);

drop policy if exists project_grid_owner_all on public.project_grid;
create policy project_grid_owner_all
on public.project_grid for all
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
);

drop policy if exists project_vec_owner_all on public.project_vectorization_settings;
create policy project_vec_owner_all
on public.project_vectorization_settings for all
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
);

drop policy if exists project_pdfs_owner_all on public.project_pdfs;
create policy project_pdfs_owner_all
on public.project_pdfs for all
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
);

-- =========================================================
-- END db/001_init.sql
-- =========================================================

-- =========================================================
-- BEGIN db/002_workflow_generation.sql
-- =========================================================
-- gruf.io - Workflow / Filter / Generation additions (MVP)
-- This migration complements db/001_init.sql based on workflow + generation specs.

-- 1) Enums
do $$ begin
  create type public.workflow_step as enum ('image', 'filter', 'convert', 'output');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.color_space as enum ('rgb', 'cmyk');
exception when duplicate_object then null; end $$;

-- 2) Track linear workflow progress on projects
alter table public.projects
  add column if not exists workflow_step public.workflow_step not null default 'image';

-- 3) Image: store detected/declared color space (no ICC precision)
alter table public.project_images
  add column if not exists color_space public.color_space;

-- 4) Filter/Optimierung settings (Step 2)
create table if not exists public.project_filter_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,

  -- target raster (cells)
  target_cols integer not null check (target_cols > 0),
  target_rows integer not null check (target_rows > 0),

  -- quantization
  max_colors integer not null check (max_colors between 1 and 1000),

  -- optional (future): dithering (off by default)
  dither boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_project_filter_settings_updated_at on public.project_filter_settings;
create trigger trg_project_filter_settings_updated_at
before update on public.project_filter_settings
for each row execute function public.set_updated_at();

-- 5) Current generation (Step 3): palette + cell labels + render settings
-- We store a single "current" generation per project (recomputed replaces prior).
create table if not exists public.project_generation (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,

  cols integer not null check (cols > 0),
  rows integer not null check (rows > 0),

  -- palette as JSON array: [{label: number, rgb: {r,g,b}, hex?: string, count?: number}, ...]
  palette jsonb not null default '[]'::jsonb,

  -- label per cell (1D array; length must be cols*rows). Values expected 0..99 (enforced loosely).
  cell_labels smallint[] not null,

  -- render settings (shared by display + pdf; toggles can be different later if needed)
  -- example:
  -- { strokeColor: "#000000", numberColor: "#000000", showNumbers: true, showPatterns: true,
  --   strokeWidthDisplay: 1, strokeWidthPdf: 0.3 }
  render_settings jsonb not null default '{}'::jsonb,

  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_generation_labels_len check (
    coalesce(array_length(cell_labels, 1), 0) = (cols * rows)
  )
);

drop trigger if exists trg_project_generation_updated_at on public.project_generation;
create trigger trg_project_generation_updated_at
before update on public.project_generation
for each row execute function public.set_updated_at();

-- 6) Tie PDFs to the current generation (Step 4) so they can be invalidated cleanly
alter table public.project_pdfs
  add column if not exists generation_id uuid references public.project_generation(id) on delete set null;

-- =========================
-- RLS (Owner-only MVP) for new tables
-- =========================

alter table public.project_filter_settings enable row level security;
alter table public.project_generation enable row level security;

drop policy if exists project_filter_settings_owner_all on public.project_filter_settings;
create policy project_filter_settings_owner_all
on public.project_filter_settings for all
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
);

drop policy if exists project_generation_owner_all on public.project_generation;
create policy project_generation_owner_all
on public.project_generation for all
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
);

-- =========================================================
-- END db/002_workflow_generation.sql
-- =========================================================

-- =========================================================
-- BEGIN db/003_file_size_bytes.sql
-- =========================================================
-- gruf.io - Store file size for images
-- Adds file_size_bytes to public.project_images so UI can display "376 kb" etc.

alter table public.project_images
  add column if not exists file_size_bytes bigint not null default 0 check (file_size_bytes >= 0);

-- =========================================================
-- END db/003_file_size_bytes.sql
-- =========================================================

-- =========================================================
-- BEGIN db/004_project_images_single_dpi.sql
-- =========================================================
-- gruf.io - Fix DPI model for images
-- DPI is a single value for the whole image (not per width/height).
-- Also: DPI and bit depth are not required at upload time.

alter table public.project_images
  add column if not exists dpi numeric;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_images'
      and column_name = 'dpi_x'
  ) then
    execute 'update public.project_images set dpi = dpi_x where dpi is null';
  end if;
end $$;

alter table public.project_images
  alter column bit_depth drop not null;

alter table public.project_images
  drop column if exists dpi_x,
  drop column if exists dpi_y;

-- =========================================================
-- END db/004_project_images_single_dpi.sql
-- =========================================================

-- =========================================================
-- BEGIN db/005_project_images_rls_policies.sql
-- =========================================================
-- gruf.io - Fix/normalize RLS for project_images (owner-only)
-- Run as postgres/supabase_admin in Supabase SQL editor.

alter table public.project_images enable row level security;

drop policy if exists project_images_select_owner on public.project_images;
create policy project_images_select_owner
on public.project_images for select
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_insert_owner on public.project_images;
create policy project_images_insert_owner
on public.project_images for insert
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_update_owner on public.project_images;
create policy project_images_update_owner
on public.project_images for update
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_delete_owner on public.project_images;
create policy project_images_delete_owner
on public.project_images for delete
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
);

-- =========================================================
-- END db/005_project_images_rls_policies.sql
-- =========================================================

-- =========================================================
-- BEGIN db/006_storage_project_images_policies.sql
-- =========================================================
-- gruf.io - Supabase Storage RLS for bucket: project_images
-- Path convention: projects/<project_id>/<role>/<filename>
-- Run as postgres/supabase_admin in Supabase SQL editor.

-- Ensure RLS is enabled on storage.objects (it usually is, but be explicit)
alter table storage.objects enable row level security;

drop policy if exists project_images_storage_select_owner on storage.objects;
create policy project_images_storage_select_owner
on storage.objects for select
using (
  bucket_id = 'project_images'
  and (storage.foldername(name))[1] = 'projects'
  and (storage.foldername(name))[3] = any (array['master','working'])
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(storage.objects.name))[2]
      and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_storage_insert_owner on storage.objects;
create policy project_images_storage_insert_owner
on storage.objects for insert
with check (
  bucket_id = 'project_images'
  and (storage.foldername(name))[1] = 'projects'
  and (storage.foldername(name))[3] = any (array['master','working'])
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(storage.objects.name))[2]
      and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_storage_update_owner on storage.objects;
create policy project_images_storage_update_owner
on storage.objects for update
using (
  bucket_id = 'project_images'
  and (storage.foldername(name))[1] = 'projects'
  and (storage.foldername(name))[3] = any (array['master','working'])
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(storage.objects.name))[2]
      and p.owner_id = auth.uid()
  )
)
with check (
  bucket_id = 'project_images'
  and (storage.foldername(name))[1] = 'projects'
  and (storage.foldername(name))[3] = any (array['master','working'])
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(storage.objects.name))[2]
      and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_storage_delete_owner on storage.objects;
create policy project_images_storage_delete_owner
on storage.objects for delete
using (
  bucket_id = 'project_images'
  and (storage.foldername(name))[1] = 'projects'
  and (storage.foldername(name))[3] = any (array['master','working'])
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(storage.objects.name))[2]
      and p.owner_id = auth.uid()
  )
);

-- =========================================================
-- END db/006_storage_project_images_policies.sql
-- =========================================================

-- =========================================================
-- BEGIN db/015_rls_policy_optimizations.sql
-- =========================================================
-- RLS policy optimizations (owner-only). See `db/015_rls_policy_optimizations.sql`.
drop policy if exists project_images_owner_all on public.project_images;
create policy project_images_owner_all
on public.project_images for all
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
)
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

drop policy if exists project_workspace_owner_all on public.project_workspace;
create policy project_workspace_owner_all
on public.project_workspace for all
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
)
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

drop policy if exists project_grid_owner_all on public.project_grid;
create policy project_grid_owner_all
on public.project_grid for all
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
)
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

drop policy if exists project_vec_owner_all on public.project_vectorization_settings;
create policy project_vec_owner_all
on public.project_vectorization_settings for all
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
)
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

drop policy if exists project_pdfs_owner_all on public.project_pdfs;
create policy project_pdfs_owner_all
on public.project_pdfs for all
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
)
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

drop policy if exists project_image_state_owner_all on public.project_image_state;
create policy project_image_state_owner_all
on public.project_image_state for all
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
)
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

drop policy if exists project_images_storage_select_owner on storage.objects;
create policy project_images_storage_select_owner
on storage.objects for select
using (
  bucket_id = 'project_images'
  and name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  and exists (
    select 1
    from public.projects p
    where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
      and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_storage_insert_owner on storage.objects;
create policy project_images_storage_insert_owner
on storage.objects for insert
with check (
  bucket_id = 'project_images'
  and name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  and exists (
    select 1
    from public.projects p
    where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
      and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_storage_update_owner on storage.objects;
create policy project_images_storage_update_owner
on storage.objects for update
using (
  bucket_id = 'project_images'
  and name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  and exists (
    select 1
    from public.projects p
    where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
      and p.owner_id = auth.uid()
  )
)
with check (
  bucket_id = 'project_images'
  and name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  and exists (
    select 1
    from public.projects p
    where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
      and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_storage_delete_owner on storage.objects;
create policy project_images_storage_delete_owner
on storage.objects for delete
using (
  bucket_id = 'project_images'
  and name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  and exists (
    select 1
    from public.projects p
    where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
      and p.owner_id = auth.uid()
  )
);
-- =========================================================
-- END db/015_rls_policy_optimizations.sql
-- =========================================================

-- =========================================================
-- BEGIN db/021_project_image_state_image_id.sql
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
-- END db/021_project_image_state_image_id.sql
-- =========================================================

-- =========================================================
-- BEGIN db/022_project_images_require_dpi.sql
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
-- END db/022_project_images_require_dpi.sql
-- =========================================================

-- =========================================================
-- BEGIN db/023_project_workspace_artboard_dpi.sql
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
-- END db/023_project_workspace_artboard_dpi.sql
-- =========================================================

-- =========================================================
-- BEGIN db/024_project_workspace_recompute_px_from_artboard_dpi.sql
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
-- END db/024_project_workspace_recompute_px_from_artboard_dpi.sql
-- =========================================================

-- =========================================================
-- BEGIN db/025_set_active_master_with_state_dpi_aligned.sql
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
-- =========================================================
-- END db/025_set_active_master_with_state_dpi_aligned.sql
-- =========================================================

-- =========================================================
-- BEGIN db/026_project_images_master_list_idx.sql
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
-- END db/026_project_images_master_list_idx.sql
-- =========================================================

-- =========================================================
-- BEGIN db/027_schema_migrations_enable_rls.sql
-- =========================================================
-- gruf.io - Enable RLS on schema_migrations table
alter table if exists public.schema_migrations enable row level security;
-- =========================================================
-- END db/027_schema_migrations_enable_rls.sql
-- =========================================================

-- =========================================================
-- BEGIN db/028_project_workspace_decouple_dpi_geometry.sql
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

alter function public.project_workspace_sync_px_cache()
  set search_path = public, pg_temp;

drop trigger if exists trg_project_workspace_sync_px_cache on public.project_workspace;
create trigger trg_project_workspace_sync_px_cache
before insert or update on public.project_workspace
for each row execute function public.project_workspace_sync_px_cache();
-- =========================================================
-- END db/028_project_workspace_decouple_dpi_geometry.sql
-- =========================================================

-- =========================================================
-- BEGIN db/029_project_images_dpi_optional.sql
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
-- END db/029_project_images_dpi_optional.sql
-- =========================================================

-- =========================================================
-- BEGIN db/030_project_workspace_output_dpi.sql
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
-- END db/030_project_workspace_output_dpi.sql
-- =========================================================

-- =========================================================
-- BEGIN db/031_project_workspace_px_u_canonical.sql
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
-- END db/031_project_workspace_px_u_canonical.sql
-- =========================================================

-- =========================================================
-- BEGIN db/032_project_images_active_variant_contract.sql
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
-- END db/032_project_images_active_variant_contract.sql
-- =========================================================

-- =========================================================
-- BEGIN db/033_project_images_lock_state.sql
-- =========================================================
-- gruf.io - Persisted lock state for project images
--
-- Purpose:
-- - Persist the editor lock/unlock state per image in DB.
-- - Enable consistent lock behavior across sessions/devices.

alter table public.project_images
  add column if not exists is_locked boolean not null default false;
-- =========================================================
-- END db/033_project_images_lock_state.sql
-- =========================================================

-- =========================================================
-- BEGIN db/034_function_search_path_hardening.sql
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

alter function public.set_active_master_latest(uuid)
  set search_path = public, pg_temp;

alter function public.set_active_master_with_state(uuid, uuid, integer, integer)
  set search_path = public, pg_temp;

alter function public.project_workspace_sync_px_cache()
  set search_path = public, pg_temp;
-- =========================================================
-- END db/034_function_search_path_hardening.sql
-- =========================================================

-- =========================================================
-- BEGIN db/035_remove_artboard_dpi_and_harden_workspace_insert.sql
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
-- END db/035_remove_artboard_dpi_and_harden_workspace_insert.sql
-- =========================================================

-- =========================================================
-- BEGIN db/036_set_active_image_hardening.sql
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

-- Keep compatibility wrappers aligned with the hardened behavior.
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
-- =========================================================
-- END db/036_set_active_image_hardening.sql
-- =========================================================

-- =========================================================
-- BEGIN db/037_master_variant_filter_contract.sql
-- =========================================================
-- gruf.io - Master / Variant / Filter contract hardening
--
-- Contract:
-- - Exactly one immutable master image per project.
-- - Every derived copy is a new row in project_images.
-- - Filters are modeled as an ordered stack (1..n), each step produces a new variant row.

-- -------------------------------------------------------------------
-- project_images: enforce one immutable master + variant lineage shape
-- -------------------------------------------------------------------

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
    -- Master content metadata must remain immutable.
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

-- -------------------------------------------------------------------
-- RLS: keep owner-only access and deny direct master delete
-- -------------------------------------------------------------------

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

-- -------------------------------------------------------------------
-- Filter stack table: each step references input and output image rows
-- -------------------------------------------------------------------

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
-- =========================================================
-- END db/037_master_variant_filter_contract.sql
-- =========================================================

-- =========================================================
-- BEGIN db/038_project_image_filters_remove_grayscale.sql
-- =========================================================
-- gruf.io - Purge all project image filters and disable filter types
--
-- Goal:
-- - Remove all persisted filter stack rows (legacy and current).
-- - Switch active image back to the pre-filter source for each affected project.
-- - Remove derived output image rows that were produced by filter steps.
-- - Disable new filter rows at DB level (no filter types allowed).

do $$
declare
  p record;
  v_base_image_id uuid;
  v_output_ids uuid[];
begin
  for p in
    select
      project_id,
      min(stack_order) as first_order
    from public.project_image_filters
    group by project_id
  loop
    select f.input_image_id
      into v_base_image_id
    from public.project_image_filters f
    where f.project_id = p.project_id
      and f.stack_order = p.first_order
    order by f.created_at, f.id
    limit 1;

    select coalesce(array_agg(output_image_id), array[]::uuid[])
      into v_output_ids
    from public.project_image_filters
    where project_id = p.project_id;

    delete from public.project_image_filters
    where project_id = p.project_id;

    if v_base_image_id is not null then
      perform public.set_active_image(p.project_id, v_base_image_id);
    end if;

    delete from public.project_images
    where id = any(v_output_ids)
      and role <> 'master';
  end loop;
end
$$;

alter table public.project_image_filters
  drop constraint if exists project_image_filters_filter_type_ck;

alter table public.project_image_filters
  drop constraint if exists project_image_filters_disabled_ck;

alter table public.project_image_filters
  add constraint project_image_filters_disabled_ck
  check (false);
-- =========================================================
-- END db/038_project_image_filters_remove_grayscale.sql
-- =========================================================

-- =========================================================
-- BEGIN db/043_reconcile_image_state_contract.sql
-- =========================================================
-- Migration 043: Reconcile image-state contract after partial 021/042 rollouts.
--
-- Canonical target:
-- - project_image_state keyed by (project_id, image_id)
-- - image_id is NOT NULL
-- - FK project_image_state.image_id -> project_images.id uses ON DELETE CASCADE
-- - set_active_master_with_state upserts on (project_id, image_id)

-- 1) Backfill legacy NULL image_id rows when an active master exists.
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

-- 2) Remove rows that cannot be repaired.
delete from public.project_image_state
where image_id is null;

-- 3) Deduplicate rows by canonical key before adding PK.
with ranked as (
  select
    ctid,
    row_number() over (
      partition by project_id, image_id
      order by updated_at desc nulls last, created_at desc nulls last
    ) as rn
  from public.project_image_state
)
delete from public.project_image_state pis
using ranked r
where pis.ctid = r.ctid
  and r.rn > 1;

-- 4) Enforce NOT NULL image_id and canonical PK.
alter table public.project_image_state
  alter column width_px_u set not null,
  alter column height_px_u set not null;

alter table public.project_image_state
  alter column image_id set not null;

alter table public.project_image_state
  drop constraint if exists project_image_state_pk;

alter table public.project_image_state
  add constraint project_image_state_pk primary key (project_id, image_id);

create index if not exists project_image_state_role_idx
  on public.project_image_state (role);

-- 5) Force FK delete behavior to CASCADE (never SET NULL).
alter table public.project_image_state
  drop constraint if exists project_image_state_image_id_fkey;

alter table public.project_image_state
  add constraint project_image_state_image_id_fkey
  foreign key (image_id)
  references public.project_images(id)
  on delete cascade;

-- 6) Canonical function definition with image-id conflict key.
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
  v_image_dpi_x numeric;
  v_artboard_dpi numeric;
  v_scale numeric;
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
    end,
    pw.output_dpi
  into v_artboard_w_u, v_artboard_h_u, v_artboard_dpi
  from public.project_workspace pw
  where pw.project_id = p_project_id;

  if v_artboard_w_u is null then v_artboard_w_u := v_w_u; end if;
  if v_artboard_h_u is null then v_artboard_h_u := v_h_u; end if;

  select pi.dpi_x
  into v_image_dpi_x
  from public.project_images pi
  where pi.id = p_image_id;

  if v_artboard_dpi is not null and v_artboard_dpi > 0 and v_image_dpi_x is not null and v_image_dpi_x > 0 then
    v_scale := v_image_dpi_x / v_artboard_dpi;
  else
    v_scale := 1.0;
  end if;

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
    (v_w_u * v_scale)::bigint::text,
    (v_h_u * v_scale)::bigint::text,
    0
  )
  on conflict (project_id, image_id)
  do update
    set role = excluded.role,
        x_px_u = excluded.x_px_u,
        y_px_u = excluded.y_px_u,
        width_px_u = excluded.width_px_u,
        height_px_u = excluded.height_px_u,
        rotation_deg = excluded.rotation_deg,
        updated_at = now();
end;
$$;
-- =========================================================
-- END db/043_reconcile_image_state_contract.sql
-- =========================================================

-- =========================================================
-- BEGIN db/039_cascade_delete_derived_images.sql
-- =========================================================
-- Migration: Cascade delete for derived images
-- Purpose: When a master image is deleted, automatically delete all derived images (filters, crops)
--
-- Changes:
-- - Modify source_image_id foreign key constraint to ON DELETE CASCADE
-- - This allows deleting master images and automatically cleans up all derived assets

alter table public.project_images
  drop constraint if exists project_images_source_image_id_fkey;

alter table public.project_images
  add constraint project_images_source_image_id_fkey
  foreign key (source_image_id)
  references public.project_images(id)
  on delete cascade;
-- =========================================================
-- END db/039_cascade_delete_derived_images.sql
-- =========================================================

-- =========================================================
-- BEGIN db/040_allow_master_image_delete.sql
-- =========================================================
-- Migration: Allow master image deletion
-- Purpose: Remove the DELETE block from guard_master_immutable trigger
--
-- Background:
-- The original trigger prevented deletion of master images to enforce immutability.
-- Now we want to allow deletion with proper cascade cleanup of derived images.
--
-- Changes:
-- - Modify guard_master_immutable() to only guard UPDATE operations
-- - Keep UPDATE guards for critical fields (storage_path, format, dimensions, etc.)
-- - Remove DELETE block entirely

create or replace function public.guard_master_immutable()
returns trigger
language plpgsql
as $$
begin
  -- Allow DELETE operations (cascade cleanup will handle derived images)
  if tg_op = 'DELETE' then
    return old;
  end if;

  -- Guard UPDATE: prevent mutation of critical master image fields
  if tg_op = 'UPDATE' and old.role = 'master' then
    if new.format is distinct from old.format
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
        message = 'master image core fields are immutable',
        detail = format('project_id=%s image_id=%s', old.project_id, old.id),
        hint = 'Create a new derived image (role=asset) instead.';
    end if;
  end if;

  return new;
end;
$$;

alter function public.guard_master_immutable()
  set search_path = public, pg_temp;
-- =========================================================
-- END db/040_allow_master_image_delete.sql
-- =========================================================

-- =========================================================
-- BEGIN db/041_add_image_dpi_columns.sql
-- =========================================================
-- Migration 041: Add DPI and bit depth columns to project_images
--
-- These columns store image metadata for DPI-based initial scaling:
-- - dpi_x, dpi_y: Dots per inch from EXIF or fallback (72)
-- - bit_depth: Color depth (8, 16, etc.)

alter table public.project_images
  add column if not exists dpi_x numeric not null default 72 check (dpi_x > 0),
  add column if not exists dpi_y numeric not null default 72 check (dpi_y > 0),
  add column if not exists bit_depth integer not null default 8 check (bit_depth > 0);
-- =========================================================
-- END db/041_add_image_dpi_columns.sql
-- =========================================================

-- =========================================================
-- BEGIN db/042_dpi_based_initial_scale.sql
-- =========================================================
-- Migration 042: DPI-based initial image scale
--
-- When activating a master image, calculate initial scale based on:
-- - Image DPI (from EXIF or fallback 72)
-- - Artboard DPI (from project_workspace.output_dpi)
-- - Scale = ImageDPI / ArtboardDPI (fallback to 1.0 if no Artboard DPI)

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
  v_image_dpi_x numeric;
  v_artboard_dpi numeric;
  v_scale numeric;
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
    end,
    pw.output_dpi
  into v_artboard_w_u, v_artboard_h_u, v_artboard_dpi
  from public.project_workspace pw
  where pw.project_id = p_project_id;

  if v_artboard_w_u is null then v_artboard_w_u := v_w_u; end if;
  if v_artboard_h_u is null then v_artboard_h_u := v_h_u; end if;

  select pi.dpi_x
  into v_image_dpi_x
  from public.project_images pi
  where pi.id = p_image_id;

  if v_artboard_dpi is not null and v_artboard_dpi > 0 and v_image_dpi_x is not null and v_image_dpi_x > 0 then
    v_scale := v_image_dpi_x / v_artboard_dpi;
  else
    v_scale := 1.0;
  end if;

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
    (v_w_u * v_scale)::bigint::text,
    (v_h_u * v_scale)::bigint::text,
    0
  )
  on conflict (project_id, role)
  do update
    set image_id = excluded.image_id,
        x_px_u = excluded.x_px_u,
        y_px_u = excluded.y_px_u,
        width_px_u = excluded.width_px_u,
        height_px_u = excluded.height_px_u,
        rotation_deg = excluded.rotation_deg,
        updated_at = now();
end;
$$;
-- =========================================================
-- END db/042_dpi_based_initial_scale.sql
-- =========================================================

-- =========================================================
-- BEGIN db/043_image_state_per_image.sql
-- =========================================================
-- Migration 043: Transform state per image (not per role)
--
-- Change primary key from (project_id, role) to (project_id, image_id)
-- to allow each filter image to have its own transform.

-- First, populate NULL image_id values with active master image
UPDATE public.project_image_state pis
SET image_id = am.image_id
FROM (
  SELECT DISTINCT ON (project_id)
    project_id,
    id as image_id
  FROM public.project_images
  WHERE role = 'master'
    AND is_active = true
    AND deleted_at IS NULL
  ORDER BY project_id, created_at DESC
) am
WHERE pis.project_id = am.project_id
  AND pis.role = 'master'
  AND pis.image_id IS NULL;

-- Drop old primary key
ALTER TABLE public.project_image_state
  DROP CONSTRAINT IF EXISTS project_image_state_pk;

-- Make image_id NOT NULL (required for primary key)
ALTER TABLE public.project_image_state
  ALTER COLUMN image_id SET NOT NULL;

-- Add new primary key on (project_id, image_id)
ALTER TABLE public.project_image_state
  ADD CONSTRAINT project_image_state_pk PRIMARY KEY (project_id, image_id);

-- Add index on role for queries that filter by role
CREATE INDEX IF NOT EXISTS project_image_state_role_idx
  ON public.project_image_state (role);
-- =========================================================
-- END db/043_image_state_per_image.sql
-- =========================================================

-- =========================================================
-- BEGIN db/044_cleanup_duplicate_fks.sql
-- =========================================================
-- Migration 044: Cleanup duplicate foreign keys
--
-- If migrations were applied multiple times, there may be duplicate FKs.
-- This migration ensures only the correct FK exists.

DO $$
DECLARE
  fk_count INTEGER;
BEGIN
  -- Count FKs from project_images.project_id to projects.id
  SELECT COUNT(*) INTO fk_count
  FROM pg_constraint
  WHERE conrelid = 'project_images'::regclass
    AND contype = 'f'
    AND confrelid = 'projects'::regclass;

  -- If more than 1 FK exists, drop all and recreate the canonical one
  IF fk_count > 1 THEN
    -- Drop all FKs from project_images to projects
    DECLARE
      fk_name TEXT;
    BEGIN
      FOR fk_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'project_images'::regclass
          AND contype = 'f'
          AND confrelid = 'projects'::regclass
      LOOP
        EXECUTE format('ALTER TABLE project_images DROP CONSTRAINT IF EXISTS %I', fk_name);
      END LOOP;
    END;

    -- Recreate the canonical FK
    ALTER TABLE public.project_images
      ADD CONSTRAINT project_images_project_id_fkey
      FOREIGN KEY (project_id)
      REFERENCES public.projects(id)
      ON DELETE CASCADE;
  END IF;
END $$;
-- =========================================================
-- END db/044_cleanup_duplicate_fks.sql
-- =========================================================

-- =========================================================
-- BEGIN db/045_cleanup_null_image_ids.sql
-- =========================================================
-- Migration 045: Cleanup NULL image_id values in project_image_state
--
-- Some old rows may have image_id=NULL if migration 043 wasn't applied yet.
-- This migration deletes orphaned rows or fills them with active master.

-- Option 1: Try to fill NULL image_ids with active master
UPDATE public.project_image_state pis
SET image_id = am.image_id
FROM (
  SELECT DISTINCT ON (project_id)
    project_id,
    id as image_id
  FROM public.project_images
  WHERE role = 'master'
    AND is_active = true
    AND deleted_at IS NULL
  ORDER BY project_id, created_at DESC
) am
WHERE pis.project_id = am.project_id
  AND pis.role = 'master'
  AND pis.image_id IS NULL;

-- Option 2: Delete any remaining rows with NULL image_id (orphaned)
DELETE FROM public.project_image_state
WHERE image_id IS NULL;
-- =========================================================
-- END db/045_cleanup_null_image_ids.sql
-- =========================================================

-- =========================================================
-- BEGIN db/046_fix_set_active_master_pk.sql
-- =========================================================
-- Migration 046: Fix set_active_master_with_state for new PK
--
-- Migration 043 changed PK from (project_id, role) to (project_id, image_id)
-- so the conflict clause in set_active_master_with_state must be updated

CREATE OR REPLACE FUNCTION public.set_active_master_with_state(
  p_project_id uuid,
  p_image_id uuid,
  p_width_px integer,
  p_height_px integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_w_u bigint;
  v_h_u bigint;
  v_artboard_w_u bigint;
  v_artboard_h_u bigint;
  v_image_dpi_x numeric;
  v_artboard_dpi numeric;
  v_scale numeric;
BEGIN
  v_w_u := greatest(1, p_width_px)::bigint * 1000000;
  v_h_u := greatest(1, p_height_px)::bigint * 1000000;

  PERFORM public.set_active_image(p_project_id, p_image_id);

  SELECT
    CASE
      WHEN pw.width_px_u IS NOT NULL THEN pw.width_px_u::bigint
      ELSE greatest(1, pw.width_px)::bigint * 1000000
    END,
    CASE
      WHEN pw.height_px_u IS NOT NULL THEN pw.height_px_u::bigint
      ELSE greatest(1, pw.height_px)::bigint * 1000000
    END,
    pw.output_dpi
  INTO v_artboard_w_u, v_artboard_h_u, v_artboard_dpi
  FROM public.project_workspace pw
  WHERE pw.project_id = p_project_id;

  IF v_artboard_w_u IS NULL THEN v_artboard_w_u := v_w_u; END IF;
  IF v_artboard_h_u IS NULL THEN v_artboard_h_u := v_h_u; END IF;

  SELECT pi.dpi_x
  INTO v_image_dpi_x
  FROM public.project_images pi
  WHERE pi.id = p_image_id;

  IF v_artboard_dpi IS NOT NULL AND v_artboard_dpi > 0 AND v_image_dpi_x IS NOT NULL AND v_image_dpi_x > 0 THEN
    v_scale := v_image_dpi_x / v_artboard_dpi;
  ELSE
    v_scale := 1.0;
  END IF;

  INSERT INTO public.project_image_state (
    project_id,
    role,
    image_id,
    x_px_u,
    y_px_u,
    width_px_u,
    height_px_u,
    rotation_deg
  ) VALUES (
    p_project_id,
    'master',
    p_image_id,
    (v_artboard_w_u / 2)::text,
    (v_artboard_h_u / 2)::text,
    (v_w_u * v_scale)::bigint::text,
    (v_h_u * v_scale)::bigint::text,
    0
  )
  ON CONFLICT (project_id, image_id)
  DO UPDATE
    SET role = excluded.role,
        x_px_u = excluded.x_px_u,
        y_px_u = excluded.y_px_u,
        width_px_u = excluded.width_px_u,
        height_px_u = excluded.height_px_u,
        rotation_deg = excluded.rotation_deg,
        updated_at = now();
END;
$$;
-- =========================================================
-- END db/046_fix_set_active_master_pk.sql
-- =========================================================

-- =========================================================
-- BEGIN db/047_force_cleanup_and_fix_function.sql
-- =========================================================
-- Migration 047: Force cleanup NULL image_ids and prevent future issues

DELETE FROM public.project_image_state WHERE image_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_active_master_with_state(
  p_project_id uuid,
  p_image_id uuid,
  p_width_px integer,
  p_height_px integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_w_u bigint;
  v_h_u bigint;
  v_artboard_w_u bigint;
  v_artboard_h_u bigint;
  v_image_dpi_x numeric;
  v_artboard_dpi numeric;
  v_scale numeric;
BEGIN
  v_w_u := greatest(1, p_width_px)::bigint * 1000000;
  v_h_u := greatest(1, p_height_px)::bigint * 1000000;

  PERFORM public.set_active_image(p_project_id, p_image_id);

  SELECT
    CASE
      WHEN pw.width_px_u IS NOT NULL THEN pw.width_px_u::bigint
      ELSE greatest(1, pw.width_px)::bigint * 1000000
    END,
    CASE
      WHEN pw.height_px_u IS NOT NULL THEN pw.height_px_u::bigint
      ELSE greatest(1, pw.height_px)::bigint * 1000000
    END,
    pw.output_dpi
  INTO v_artboard_w_u, v_artboard_h_u, v_artboard_dpi
  FROM public.project_workspace pw
  WHERE pw.project_id = p_project_id;

  IF v_artboard_w_u IS NULL THEN v_artboard_w_u := v_w_u; END IF;
  IF v_artboard_h_u IS NULL THEN v_artboard_h_u := v_h_u; END IF;

  SELECT pi.dpi_x
  INTO v_image_dpi_x
  FROM public.project_images pi
  WHERE pi.id = p_image_id;

  IF v_artboard_dpi IS NOT NULL AND v_artboard_dpi > 0 AND v_image_dpi_x IS NOT NULL AND v_image_dpi_x > 0 THEN
    v_scale := v_image_dpi_x / v_artboard_dpi;
  ELSE
    v_scale := 1.0;
  END IF;

  DELETE FROM public.project_image_state
  WHERE project_id = p_project_id AND (image_id = p_image_id OR image_id IS NULL);

  INSERT INTO public.project_image_state (
    project_id,
    role,
    image_id,
    x_px_u,
    y_px_u,
    width_px_u,
    height_px_u,
    rotation_deg
  ) VALUES (
    p_project_id,
    'master',
    p_image_id,
    (v_artboard_w_u / 2)::text,
    (v_artboard_h_u / 2)::text,
    (v_w_u * v_scale)::bigint::text,
    (v_h_u * v_scale)::bigint::text,
    0
  );
END;
$$;
-- =========================================================
-- END db/047_force_cleanup_and_fix_function.sql
-- =========================================================

-- =========================================================
-- BEGIN db/048_reconcile_image_state_fk_and_master_state.sql
-- =========================================================
-- Migration 048: Reconcile image_state FK and master-state function
--
-- Purpose:
-- - Fix incompatibility between NOT NULL image_id and old FK ON DELETE SET NULL.
-- - Keep project_image_state stable after PK switch to (project_id, image_id).
-- - Ensure set_active_master_with_state upserts on the new PK.

-- 1) Defensive cleanup of legacy/null rows.
DELETE FROM public.project_image_state
WHERE image_id IS NULL;

-- 2) Ensure FK is cascade (NOT set null), compatible with NOT NULL image_id.
ALTER TABLE public.project_image_state
  DROP CONSTRAINT IF EXISTS project_image_state_image_id_fkey;

ALTER TABLE public.project_image_state
  ADD CONSTRAINT project_image_state_image_id_fkey
  FOREIGN KEY (image_id)
  REFERENCES public.project_images(id)
  ON DELETE CASCADE;

-- 3) Canonical function for activating master + initializing/refreshing state.
CREATE OR REPLACE FUNCTION public.set_active_master_with_state(
  p_project_id uuid,
  p_image_id uuid,
  p_width_px integer,
  p_height_px integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_w_u bigint;
  v_h_u bigint;
  v_artboard_w_u bigint;
  v_artboard_h_u bigint;
  v_image_dpi_x numeric;
  v_artboard_dpi numeric;
  v_scale numeric;
BEGIN
  v_w_u := greatest(1, p_width_px)::bigint * 1000000;
  v_h_u := greatest(1, p_height_px)::bigint * 1000000;

  PERFORM public.set_active_image(p_project_id, p_image_id);

  SELECT
    CASE
      WHEN pw.width_px_u IS NOT NULL THEN pw.width_px_u::bigint
      ELSE greatest(1, pw.width_px)::bigint * 1000000
    END,
    CASE
      WHEN pw.height_px_u IS NOT NULL THEN pw.height_px_u::bigint
      ELSE greatest(1, pw.height_px)::bigint * 1000000
    END,
    pw.output_dpi
  INTO v_artboard_w_u, v_artboard_h_u, v_artboard_dpi
  FROM public.project_workspace pw
  WHERE pw.project_id = p_project_id;

  IF v_artboard_w_u IS NULL THEN v_artboard_w_u := v_w_u; END IF;
  IF v_artboard_h_u IS NULL THEN v_artboard_h_u := v_h_u; END IF;

  SELECT pi.dpi_x
  INTO v_image_dpi_x
  FROM public.project_images pi
  WHERE pi.id = p_image_id;

  IF v_artboard_dpi IS NOT NULL AND v_artboard_dpi > 0 AND v_image_dpi_x IS NOT NULL AND v_image_dpi_x > 0 THEN
    v_scale := v_image_dpi_x / v_artboard_dpi;
  ELSE
    v_scale := 1.0;
  END IF;

  INSERT INTO public.project_image_state (
    project_id,
    role,
    image_id,
    x_px_u,
    y_px_u,
    width_px_u,
    height_px_u,
    rotation_deg
  ) VALUES (
    p_project_id,
    'master',
    p_image_id,
    (v_artboard_w_u / 2)::text,
    (v_artboard_h_u / 2)::text,
    (v_w_u * v_scale)::bigint::text,
    (v_h_u * v_scale)::bigint::text,
    0
  )
  ON CONFLICT (project_id, image_id)
  DO UPDATE
    SET role = excluded.role,
        x_px_u = excluded.x_px_u,
        y_px_u = excluded.y_px_u,
        width_px_u = excluded.width_px_u,
        height_px_u = excluded.height_px_u,
        rotation_deg = excluded.rotation_deg,
        updated_at = now();
END;
$$;
-- =========================================================
-- END db/048_reconcile_image_state_fk_and_master_state.sql
-- =========================================================

-- =========================================================
-- BEGIN db/049_enable_project_image_filters.sql
-- =========================================================
-- Re-enable persisted filter stack rows for current filter pipeline.
-- The app writes canonical filter chain rows into project_image_filters.

alter table public.project_image_filters
  drop constraint if exists project_image_filters_disabled_ck;

alter table public.project_image_filters
  drop constraint if exists project_image_filters_filter_type_ck;

alter table public.project_image_filters
  add constraint project_image_filters_filter_type_ck
  check (filter_type in ('pixelate', 'lineart', 'numerate'));
-- =========================================================
-- END db/049_enable_project_image_filters.sql
-- =========================================================

-- =========================================================
-- BEGIN db/050_atomic_filter_chain_append.sql
-- =========================================================
-- Atomically append one filter row to a project's chain with tip-append invariants.
-- This prevents concurrent stack_order races and accidental branch appends.

create or replace function public.append_project_image_filter(
  p_project_id uuid,
  p_input_image_id uuid,
  p_output_image_id uuid,
  p_filter_type text,
  p_filter_params jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_last_output uuid;
  v_next_order integer;
  v_inserted_id uuid;
  v_input_project_id uuid;
  v_output_project_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  select project_id
    into v_input_project_id
  from public.project_images
  where id = p_input_image_id
    and deleted_at is null;

  if v_input_project_id is distinct from p_project_id then
    raise exception 'input_image_id is not part of project'
      using errcode = '23503';
  end if;

  select project_id
    into v_output_project_id
  from public.project_images
  where id = p_output_image_id
    and deleted_at is null;

  if v_output_project_id is distinct from p_project_id then
    raise exception 'output_image_id is not part of project'
      using errcode = '23503';
  end if;

  select f.output_image_id
    into v_last_output
  from public.project_image_filters f
  where f.project_id = p_project_id
  order by f.stack_order desc
  limit 1;

  if v_last_output is not null and v_last_output <> p_input_image_id then
    raise exception 'filter chain tip mismatch'
      using errcode = '23514';
  end if;

  select coalesce(max(stack_order), 0) + 1
    into v_next_order
  from public.project_image_filters
  where project_id = p_project_id;

  insert into public.project_image_filters (
    project_id,
    input_image_id,
    output_image_id,
    filter_type,
    filter_params,
    stack_order
  ) values (
    p_project_id,
    p_input_image_id,
    p_output_image_id,
    p_filter_type,
    coalesce(p_filter_params, '{}'::jsonb),
    v_next_order
  )
  returning id into v_inserted_id;

  return v_inserted_id;
end;
$$;
-- =========================================================
-- END db/050_atomic_filter_chain_append.sql
-- =========================================================

-- =========================================================
-- BEGIN db/051_canonical_set_active_master_with_state.sql
-- =========================================================
-- Canonicalize set_active_master_with_state after 042/043/046/047/048 drift.
--
-- Goal:
-- - Keep one stable function body aligned with current schema (`project_images.dpi`).
-- - Preserve PK upsert on (project_id, image_id) for project_image_state.
-- - Use workspace output_dpi as reference scale where available.

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
  v_image_dpi numeric;
  v_artboard_dpi numeric;
  v_scale numeric;
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
    end,
    pw.output_dpi
  into v_artboard_w_u, v_artboard_h_u, v_artboard_dpi
  from public.project_workspace pw
  where pw.project_id = p_project_id;

  if v_artboard_w_u is null then v_artboard_w_u := v_w_u; end if;
  if v_artboard_h_u is null then v_artboard_h_u := v_h_u; end if;

  select pi.dpi
  into v_image_dpi
  from public.project_images pi
  where pi.id = p_image_id;

  if v_artboard_dpi is not null and v_artboard_dpi > 0 and v_image_dpi is not null and v_image_dpi > 0 then
    v_scale := v_image_dpi / v_artboard_dpi;
  else
    v_scale := 1.0;
  end if;

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
    (v_w_u * v_scale)::bigint::text,
    (v_h_u * v_scale)::bigint::text,
    0
  )
  on conflict (project_id, image_id)
  do update
    set role = excluded.role,
        x_px_u = excluded.x_px_u,
        y_px_u = excluded.y_px_u,
        width_px_u = excluded.width_px_u,
        height_px_u = excluded.height_px_u,
        rotation_deg = excluded.rotation_deg,
        updated_at = now();
end;
$$;

alter function public.set_active_master_with_state(uuid, uuid, integer, integer)
  set search_path = public, pg_temp;
-- =========================================================
-- END db/051_canonical_set_active_master_with_state.sql
-- =========================================================

-- =========================================================
-- BEGIN db/052_reinforce_master_immutable_contract.sql
-- =========================================================
-- Reinforce immutable-master contract after historical delete experiments.
--
-- Canonical model:
-- - Master rows are immutable and cannot be deleted.
-- - Delete policy remains restricted to non-master rows.

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
        hint = 'Only active-pointer changes are allowed for master rows.';
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

drop policy if exists project_images_owner_delete_non_master on public.project_images;
create policy project_images_owner_delete_non_master
on public.project_images for delete
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
  and role <> 'master'
);
-- =========================================================
-- END db/052_reinforce_master_immutable_contract.sql
-- =========================================================

-- =========================================================
-- BEGIN db/053_collect_transitive_delete_targets.sql
-- =========================================================
-- Collect transitive delete targets for a project image root.
--
-- Returns the root image plus all descendants via source_image_id lineage.
-- Used by API routes to perform storage cleanup without JS graph traversal.

create or replace function public.collect_project_image_delete_targets(
  p_project_id uuid,
  p_root_image_id uuid
)
returns table (
  id uuid,
  storage_bucket text,
  storage_path text
)
language sql
stable
as $$
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
$$;

alter function public.collect_project_image_delete_targets(uuid, uuid)
  set search_path = public, pg_temp;
-- =========================================================
-- END db/053_collect_transitive_delete_targets.sql
-- =========================================================

-- =========================================================
-- BEGIN db/051_set_active_master_with_state_contain_fit.sql
-- =========================================================
-- Migration 051: Initial master-state seed via contain-fit (no DPI scaling)
--
-- Purpose:
-- - Use one deterministic contain-fit contract for initial upload sizing.
-- - Avoid DPI-ratio scaling drift between server-seeded and client placement.

CREATE OR REPLACE FUNCTION public.set_active_master_with_state(
  p_project_id uuid,
  p_image_id uuid,
  p_width_px integer,
  p_height_px integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_w_u bigint;
  v_h_u bigint;
  v_artboard_w_u bigint;
  v_artboard_h_u bigint;
  v_scale numeric;
BEGIN
  v_w_u := greatest(1, p_width_px)::bigint * 1000000;
  v_h_u := greatest(1, p_height_px)::bigint * 1000000;

  PERFORM public.set_active_image(p_project_id, p_image_id);

  SELECT
    CASE
      WHEN pw.width_px_u IS NOT NULL THEN pw.width_px_u::bigint
      ELSE greatest(1, pw.width_px)::bigint * 1000000
    END,
    CASE
      WHEN pw.height_px_u IS NOT NULL THEN pw.height_px_u::bigint
      ELSE greatest(1, pw.height_px)::bigint * 1000000
    END
  INTO v_artboard_w_u, v_artboard_h_u
  FROM public.project_workspace pw
  WHERE pw.project_id = p_project_id;

  IF v_artboard_w_u IS NULL THEN v_artboard_w_u := v_w_u; END IF;
  IF v_artboard_h_u IS NULL THEN v_artboard_h_u := v_h_u; END IF;

  v_scale := LEAST(
    v_artboard_w_u::numeric / v_w_u::numeric,
    v_artboard_h_u::numeric / v_h_u::numeric
  );
  IF v_scale <= 0 THEN v_scale := 1.0; END IF;

  INSERT INTO public.project_image_state (
    project_id,
    role,
    image_id,
    x_px_u,
    y_px_u,
    width_px_u,
    height_px_u,
    rotation_deg
  ) VALUES (
    p_project_id,
    'master',
    p_image_id,
    (v_artboard_w_u / 2)::text,
    (v_artboard_h_u / 2)::text,
    (v_w_u * v_scale)::bigint::text,
    (v_h_u * v_scale)::bigint::text,
    0
  )
  ON CONFLICT (project_id, image_id)
  DO UPDATE
    SET role = excluded.role,
        x_px_u = excluded.x_px_u,
        y_px_u = excluded.y_px_u,
        width_px_u = excluded.width_px_u,
        height_px_u = excluded.height_px_u,
        rotation_deg = excluded.rotation_deg,
        updated_at = now();
END;
$$;
-- =========================================================
-- END db/051_set_active_master_with_state_contain_fit.sql
-- =========================================================

-- =========================================================
-- BEGIN db/052_set_active_master_with_state_centered_100pct.sql
-- =========================================================
-- Migration 052: Initial master-state seed at 100% intrinsic size (centered)
--
-- Purpose:
-- - Match Illustrator-like initial placement behavior.
-- - Keep one deterministic contract across server seed and client fallback.

CREATE OR REPLACE FUNCTION public.set_active_master_with_state(
  p_project_id uuid,
  p_image_id uuid,
  p_width_px integer,
  p_height_px integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_w_u bigint;
  v_h_u bigint;
  v_artboard_w_u bigint;
  v_artboard_h_u bigint;
BEGIN
  v_w_u := greatest(1, p_width_px)::bigint * 1000000;
  v_h_u := greatest(1, p_height_px)::bigint * 1000000;

  PERFORM public.set_active_image(p_project_id, p_image_id);

  SELECT
    CASE
      WHEN pw.width_px_u IS NOT NULL THEN pw.width_px_u::bigint
      ELSE greatest(1, pw.width_px)::bigint * 1000000
    END,
    CASE
      WHEN pw.height_px_u IS NOT NULL THEN pw.height_px_u::bigint
      ELSE greatest(1, pw.height_px)::bigint * 1000000
    END
  INTO v_artboard_w_u, v_artboard_h_u
  FROM public.project_workspace pw
  WHERE pw.project_id = p_project_id;

  IF v_artboard_w_u IS NULL THEN v_artboard_w_u := v_w_u; END IF;
  IF v_artboard_h_u IS NULL THEN v_artboard_h_u := v_h_u; END IF;

  INSERT INTO public.project_image_state (
    project_id,
    role,
    image_id,
    x_px_u,
    y_px_u,
    width_px_u,
    height_px_u,
    rotation_deg
  ) VALUES (
    p_project_id,
    'master',
    p_image_id,
    (v_artboard_w_u / 2)::text,
    (v_artboard_h_u / 2)::text,
    v_w_u::text,
    v_h_u::text,
    0
  )
  ON CONFLICT (project_id, image_id)
  DO UPDATE
    SET role = excluded.role,
        x_px_u = excluded.x_px_u,
        y_px_u = excluded.y_px_u,
        width_px_u = excluded.width_px_u,
        height_px_u = excluded.height_px_u,
        rotation_deg = excluded.rotation_deg,
        updated_at = now();
END;
$$;
-- =========================================================
-- END db/052_set_active_master_with_state_centered_100pct.sql
-- =========================================================

-- =========================================================
-- BEGIN db/053_set_active_master_with_state_dpi_relative.sql
-- =========================================================
-- Migration 053: Persist precomputed initial master-state placement (single formula source in TypeScript)
--
-- Contract:
-- - Client/server compute x/y/width/height via shared TS DPI formula.
-- - SQL persists exactly those µpx values without recalculating scale.

-- Remove legacy overloads to enforce a single callable RPC signature.
DROP FUNCTION IF EXISTS public.set_active_master_with_state(uuid, uuid, integer, integer);
DROP FUNCTION IF EXISTS public.set_active_master_with_state(uuid, uuid, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.set_active_master_with_state(
  p_project_id uuid,
  p_image_id uuid,
  p_x_px_u text,
  p_y_px_u text,
  p_width_px_u text,
  p_height_px_u text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_x_u bigint;
  v_y_u bigint;
  v_w_u bigint;
  v_h_u bigint;
BEGIN
  v_x_u := p_x_px_u::bigint;
  v_y_u := p_y_px_u::bigint;
  v_w_u := p_width_px_u::bigint;
  v_h_u := p_height_px_u::bigint;

  IF v_w_u <= 0 OR v_h_u <= 0 THEN
    RAISE EXCEPTION 'initial placement size must be positive';
  END IF;

  PERFORM public.set_active_image(p_project_id, p_image_id);

  INSERT INTO public.project_image_state (
    project_id,
    role,
    image_id,
    x_px_u,
    y_px_u,
    width_px_u,
    height_px_u,
    rotation_deg
  ) VALUES (
    p_project_id,
    'master',
    p_image_id,
    v_x_u::text,
    v_y_u::text,
    v_w_u::text,
    v_h_u::text,
    0
  )
  ON CONFLICT (project_id, image_id)
  DO UPDATE
    SET role = excluded.role,
        x_px_u = excluded.x_px_u,
        y_px_u = excluded.y_px_u,
        width_px_u = excluded.width_px_u,
        height_px_u = excluded.height_px_u,
        rotation_deg = excluded.rotation_deg,
        updated_at = now();
END;
$$;

ALTER FUNCTION public.set_active_master_with_state(uuid, uuid, text, text, text, text)
  SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.set_active_master_with_state(uuid, uuid, text, text, text, text)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
-- =========================================================
-- END db/053_set_active_master_with_state_dpi_relative.sql
-- =========================================================

-- =========================================================
-- BEGIN db/054_project_images_kind_backfill.sql
-- =========================================================
do $$ begin
  create type public.image_kind as enum ('master', 'working_copy', 'filter_working_copy');
exception when duplicate_object then null; end $$;

alter table public.project_images
  add column if not exists kind public.image_kind;

-- Deterministic backfill:
-- - role=master => master
-- - role=asset with lineage/name filter marker => filter_working_copy
-- - remaining non-master rows => working_copy
update public.project_images
set kind = case
  when role = 'master' then 'master'::public.image_kind
  when role = 'asset' and (source_image_id is not null or lower(name) like '%(filter working)%') then 'filter_working_copy'::public.image_kind
  else 'working_copy'::public.image_kind
end
where kind is null;

-- =========================================================
-- END db/054_project_images_kind_backfill.sql
-- =========================================================

-- =========================================================
-- BEGIN db/055_project_images_kind_constraints.sql
-- =========================================================
alter table public.project_images
  alter column kind set not null;

-- One active master per project.
create unique index if not exists project_images_active_master_kind_uidx
  on public.project_images(project_id)
  where is_active is true and deleted_at is null and kind = 'master';

-- One active working copy per project.
create unique index if not exists project_images_active_working_copy_kind_uidx
  on public.project_images(project_id)
  where is_active is true and deleted_at is null and kind = 'working_copy';
-- =========================================================
-- END db/055_project_images_kind_constraints.sql
-- =========================================================
