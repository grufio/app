-- gruf.io - Canonical workspace geometry is width_px_u/height_px_u (pixel-only)
--
-- Goal:
-- - On UPDATE: never recompute `width_px_u/height_px_u` from width_value/unit/DPI
-- - Always derive cached integer px (`width_px/height_px`) from canonical µpx
-- - Require canonical µpx on INSERT (no value/unit/DPI fallback)

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
    if new.width_px_u is null or new.height_px_u is null then
      raise exception using
        message = 'project_workspace INSERT requires width_px_u and height_px_u',
        hint = 'Provide canonical micro-pixel geometry explicitly.';
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

