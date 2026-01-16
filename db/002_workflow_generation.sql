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

