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

