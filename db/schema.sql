-- gruf.io Combined Schema
--
-- This file is a single, runnable schema that contains:
-- 1) db/001_init.sql
-- 2) db/002_workflow_generation.sql
--
-- Keep the numbered files as the canonical migrations. This file exists as a convenience
-- when you want to run everything in one go (e.g. in Supabase SQL editor).

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

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- if unit is px, the values must match cached px
  constraint workspace_px_consistency check (
    unit <> 'px' or
    (width_value = width_px::numeric and height_value = height_px::numeric)
  )
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
