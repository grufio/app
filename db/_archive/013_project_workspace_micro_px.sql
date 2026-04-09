-- gruf.io - Canonical workspace sizing in µpx (micro-pixels)
--
-- Problem: `project_workspace.width_px/height_px` are INTEGER caches. If they are ever used as the
-- source for unit conversion, roundtrips are wrong (e.g. 100mm -> 1181.1024px -> 99.991mm).
--
-- Fix: introduce canonical `width_px_u/height_px_u` as µpx fixed-point integers stored as strings.
-- Keep `width_px/height_px` as derived integer caches for canvas + queries.

-- 1) Helper: convert (value, unit, dpi) -> µpx (bigint).
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

-- 2) Add canonical µpx columns (strings).
alter table public.project_workspace
  add column if not exists width_px_u text,
  add column if not exists height_px_u text;

-- 3) Backfill µpx columns from existing unit/value/dpi.
update public.project_workspace
set
  width_px_u = coalesce(width_px_u, public.workspace_value_to_px_u(width_value, unit, dpi_x)::text),
  height_px_u = coalesce(height_px_u, public.workspace_value_to_px_u(height_value, unit, dpi_y)::text)
where width_px_u is null or height_px_u is null;

-- 4) Drop old constraint that forces `unit='px'` to be integer-only.
-- Unit is display metadata; canonical truth is µpx.
alter table public.project_workspace
  drop constraint if exists workspace_px_consistency;

-- 5) Derive integer px caches from µpx (half-up: +0.5px then floor).
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
  -- Ensure µpx exists (fallback for legacy writers during rollout).
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

-- 6) Enforce canonical µpx presence + bounds (keep in sync with app MAX_PX_U).
alter table public.project_workspace
  alter column width_px_u set not null,
  alter column height_px_u set not null;

alter table public.project_workspace
  drop constraint if exists project_workspace_width_px_u_positive,
  drop constraint if exists project_workspace_height_px_u_positive,
  drop constraint if exists project_workspace_px_cache_consistency;

-- Minimum: 1px = 1_000_000µpx. Maximum: 32768px = 32_768_000_000µpx.
alter table public.project_workspace
  add constraint project_workspace_width_px_u_positive check ((width_px_u::bigint) >= 1000000 and (width_px_u::bigint) <= 32768000000),
  add constraint project_workspace_height_px_u_positive check ((height_px_u::bigint) >= 1000000 and (height_px_u::bigint) <= 32768000000),
  add constraint project_workspace_px_cache_consistency check (
    width_px = greatest(1, (((width_px_u::bigint) + 500000) / 1000000)::int) and
    height_px = greatest(1, (((height_px_u::bigint) + 500000) / 1000000)::int)
  );

