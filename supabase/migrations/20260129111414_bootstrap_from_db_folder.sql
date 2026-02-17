-- Bootstrap schema for CLI-first migrations.
--
-- This file is an ordered concatenation of the legacy `db/0xx_*.sql` migrations.
-- It is intended to be idempotent (uses `if exists` / `if not exists` patterns).
--
-- Going forward: add new migrations under `supabase/migrations/` and apply via:
--   supabase db push --linked

-- =========================================================
-- db/001_init.sql
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

  -- authoritative values in the chosen unit
  width_value numeric not null check (width_value > 0),
  height_value numeric not null check (height_value > 0),

  -- resolution stored separately
  dpi_x numeric not null check (dpi_x > 0),
  dpi_y numeric not null check (dpi_y > 0),

  -- cached/derived pixel size
  width_px integer not null check (width_px > 0),
  height_px integer not null check (height_px > 0),

  -- Illustrator-like "Document Raster Effects Settings" preset for UX (optional)
  raster_effects_preset text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- if unit is px, the values must match cached px
  constraint workspace_px_consistency check (
    unit <> 'px' or
    (width_value = width_px::numeric and height_value = height_px::numeric)
  )
);

alter table public.project_workspace
  drop constraint if exists project_workspace_raster_effects_preset_check;
alter table public.project_workspace
  add constraint project_workspace_raster_effects_preset_check
  check (raster_effects_preset is null or raster_effects_preset in ('high', 'medium', 'low'));

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
-- db/002_workflow_generation.sql
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
-- db/003_file_size_bytes.sql
-- =========================================================
-- gruf.io - Store file size for images
-- Adds file_size_bytes to public.project_images so UI can display "376 kb" etc.

alter table public.project_images
  add column if not exists file_size_bytes bigint not null default 0 check (file_size_bytes >= 0);

-- =========================================================
-- db/004_project_images_single_dpi.sql
-- =========================================================
-- gruf.io - Fix DPI model for images
-- DPI is a single value for the whole image (not per width/height).
-- Also: DPI and bit depth are not required at upload time.

-- 1) Add single dpi column (nullable)
alter table public.project_images
  add column if not exists dpi numeric;

-- 2) Backfill from old dpi_x/dpi_y if present (prefer dpi_x)
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

-- 3) Make bit_depth nullable (upload does not require it)
alter table public.project_images
  alter column bit_depth drop not null;

-- 4) Drop old per-axis dpi columns if they exist
alter table public.project_images
  drop column if exists dpi_x,
  drop column if exists dpi_y;

-- =========================================================
-- db/005_project_images_rls_policies.sql
-- =========================================================
-- gruf.io - Fix/normalize RLS for project_images (owner-only)
-- Run as postgres/supabase_admin in Supabase SQL editor.

-- Ensure RLS is enabled
alter table public.project_images enable row level security;

-- Recreate policies explicitly (works with INSERT/UPDATE and UPSERT)
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
-- db/006_storage_project_images_policies.sql
-- =========================================================
-- NOTE:
-- Storage policies (`storage.objects`) require elevated privileges and cannot be
-- applied via `supabase db push` with the regular linked DB role.
-- Apply `db/006_storage_project_images_policies.sql` manually in the Supabase SQL editor.

-- =========================================================
-- db/007_project_image_state.sql
-- =========================================================
-- gruf.io - Persist editor "working copy" image transform (position/scale/rotation)

create table if not exists public.project_image_state (
  project_id uuid not null references public.projects(id) on delete cascade,
  role public.image_role not null,

  -- image transform in artboard/world coordinates
  x numeric not null default 0,
  y numeric not null default 0,
  scale_x numeric not null default 1 check (scale_x > 0),
  scale_y numeric not null default 1 check (scale_y > 0),
  width_px numeric check (width_px is null or width_px > 0),
  height_px numeric check (height_px is null or height_px > 0),
  unit public.measure_unit,
  dpi numeric check (dpi is null or dpi > 0),
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
-- db/008_project_image_state_size.sql
-- =========================================================
-- gruf.io - Persist editor "working copy" image size (px) alongside transform

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
-- db/009_project_image_state_meta.sql
-- =========================================================
-- gruf.io - Persist image display meta (unit + dpi) on image state

alter table public.project_image_state
  add column if not exists unit public.measure_unit,
  add column if not exists dpi numeric;

alter table public.project_image_state
  drop constraint if exists project_image_state_dpi_positive;
alter table public.project_image_state
  add constraint project_image_state_dpi_positive check (dpi is null or dpi > 0);

-- =========================================================
-- db/010_project_workspace_raster_preset.sql
-- =========================================================
-- gruf.io - Persist Artboard raster effects quality preset (Illustrator-like)

alter table public.project_workspace
  add column if not exists raster_effects_preset text;

alter table public.project_workspace
  drop constraint if exists project_workspace_raster_effects_preset_check;
alter table public.project_workspace
  add constraint project_workspace_raster_effects_preset_check
  check (raster_effects_preset is null or raster_effects_preset in ('high', 'medium', 'low'));

-- =========================================================
-- db/011_project_image_state_micro_px.sql
-- =========================================================
-- gruf.io - Persist image state size/position in µpx (string BigInt)

alter table public.project_image_state
  add column if not exists width_px_u text,
  add column if not exists height_px_u text,
  add column if not exists x_px_u text,
  add column if not exists y_px_u text;

-- =========================================================
-- db/012_project_grid_xy.sql
-- =========================================================
-- gruf.io - Grid spacing X/Y (MVP)

alter table public.project_grid
  add column if not exists spacing_x_value numeric,
  add column if not exists spacing_y_value numeric;

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

-- =========================================================
-- db/013_project_workspace_micro_px.sql
-- =========================================================
-- gruf.io - Canonical workspace sizing in µpx (micro-pixels)

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

update public.project_workspace
set
  width_px_u = coalesce(width_px_u, public.workspace_value_to_px_u(width_value, unit, dpi_x)::text),
  height_px_u = coalesce(height_px_u, public.workspace_value_to_px_u(height_value, unit, dpi_y)::text)
where width_px_u is null or height_px_u is null;

alter table public.project_workspace
  drop constraint if exists workspace_px_consistency;

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
-- db/014_projects_owner_updated_at_idx.sql
-- =========================================================
-- gruf.io - Optimize dashboard project list ordering

create index if not exists projects_owner_updated_at_idx
on public.projects (owner_id, updated_at desc);

-- =========================================================
-- db/015_rls_policy_optimizations.sql
-- =========================================================
-- gruf.io - RLS policy optimizations (owner-only)

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
-- NOTE:
-- Storage policy optimizations (the `storage.objects` policies) must also be applied
-- manually in the Supabase SQL editor (see db/015_rls_policy_optimizations.sql).

-- =========================================================
-- db/016_project_workspace_page_bg.sql
-- =========================================================
-- gruf.io - Persist editor \"Page\" background

alter table public.project_workspace
  add column if not exists page_bg_enabled boolean default false,
  add column if not exists page_bg_color text default '#ffffff',
  add column if not exists page_bg_opacity integer default 50;

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
-- db/017_schema_migrations.sql (optional)
-- =========================================================
-- gruf.io - Track applied SQL migrations (optional)

create table if not exists public.schema_migrations (
  id bigserial primary key,
  filename text not null,
  checksum_sha256 text not null,
  applied_at timestamptz not null default now(),
  constraint schema_migrations_filename_unique unique (filename)
);

-- =========================================================
-- db/018_project_workspace_output_dpi.sql
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
update public.project_workspace
set
  output_dpi_x = coalesce(output_dpi_x, dpi_x, 300),
  output_dpi_y = coalesce(output_dpi_y, dpi_y, 300)
where output_dpi_x is null or output_dpi_y is null;

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
-- db/019_project_images_multi.sql
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

update public.project_workspace
set artboard_dpi = coalesce(artboard_dpi, output_dpi_x, dpi_x, output_dpi_y, dpi_y, 300)
where artboard_dpi is null;

-- Ensure canonical/cached pixel fields are consistent with the new single DPI source.
update public.project_workspace
set
  width_px_u = public.workspace_value_to_px_u(width_value, unit, artboard_dpi)::text,
  height_px_u = public.workspace_value_to_px_u(height_value, unit, artboard_dpi)::text;

update public.project_workspace
set
  width_px = greatest(1, (((width_px_u::bigint) + 500000) / 1000000)::int),
  height_px = greatest(1, (((height_px_u::bigint) + 500000) / 1000000)::int);

-- =========================================================
-- db/025_set_active_master_with_state_dpi_aligned.sql
-- =========================================================
-- gruf.io - Align active-master seeded image-state with placement DPI semantics
--
-- Purpose:
-- - Keep server-seeded persisted size aligned with client placement formula:
--   size_px = (pixels / image_dpi) * artboard_dpi
-- - Prevent first-load/reload size jumps when image DPI differs from artboard DPI.

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
  v_artboard_dpi numeric;
  v_image_dpi numeric;
begin
  -- Default to raw pixel size (current behavior) and override when both DPI values are valid.
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
    end,
    pw.artboard_dpi,
    pi.dpi
  into v_artboard_w_u, v_artboard_h_u, v_artboard_dpi, v_image_dpi
  from public.project_workspace pw
  left join public.project_images pi on pi.id = p_image_id
  where pw.project_id = p_project_id;

  if v_artboard_w_u is null then v_artboard_w_u := v_w_u; end if;
  if v_artboard_h_u is null then v_artboard_h_u := v_h_u; end if;

  if v_artboard_dpi is not null and v_artboard_dpi > 0 and v_image_dpi is not null and v_image_dpi > 0 then
    v_w_u := greatest(
      1000000::bigint,
      round(((greatest(1, p_width_px)::numeric / v_image_dpi) * v_artboard_dpi) * 1000000)::bigint
    );
    v_h_u := greatest(
      1000000::bigint,
      round(((greatest(1, p_height_px)::numeric / v_image_dpi) * v_artboard_dpi) * 1000000)::bigint
    );
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
-- gruf.io - Recompute workspace px cache from artboard_dpi
--
-- Goal:
-- - enforce one canonical source for workspace geometry:
--   width_value/height_value + unit + artboard_dpi
-- - repair existing rows that still carry legacy 72-ppi derived px values
-- - keep this migration as data-repair only (trigger semantics are owned by db/023)

update public.project_workspace
set
  width_px_u = public.workspace_value_to_px_u(width_value, unit, artboard_dpi)::text,
  height_px_u = public.workspace_value_to_px_u(height_value, unit, artboard_dpi)::text;

update public.project_workspace
set
  width_px = greatest(1, (((width_px_u::bigint) + 500000) / 1000000)::int),
  height_px = greatest(1, (((height_px_u::bigint) + 500000) / 1000000)::int);

