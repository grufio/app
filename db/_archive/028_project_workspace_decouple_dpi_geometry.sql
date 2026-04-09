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
