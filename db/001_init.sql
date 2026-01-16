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
as $$
begin
  new.updated_at = now();
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

