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
  drop constraint if exists project_workspace_artboard_dpi_positive;

alter table public.project_workspace
  drop column if exists artboard_dpi;

