-- PR-6: project_image_state diet — drop role + legacy numeric duplicates.
--
-- µpx (*_px_u TEXT) ist die single source of truth. Alle anderen
-- Achs-/Skala-/DPI-Spalten sind redundant und werden im App-Code
-- nicht mehr referenziert (nach den Code-Änderungen im selben PR):
--
--   role        -> kind auf project_images ist die kanonische Klassifikation.
--                  resolveImageStateRoleFromProjectImage() wurde gelöscht.
--                  set_active_master_with_state schreibt role nicht mehr.
--   x, y        -> redundant zu x_px_u, y_px_u (µpx).
--   scale_x, scale_y -> nirgends gesetzt/gelesen, war Teil eines früheren
--                       Transform-PoC.
--   width_px, height_px -> redundant zu width_px_u, height_px_u (µpx).
--   unit, dpi   -> Workspace-skaliert, nicht pro Image-State.
--
-- RPC set_active_master_with_state wird CREATE OR REPLACE — Insert/Upsert
-- ohne role-Spalte.

begin;

-- 1. RPC neu definieren (vor Spalten-Drop, damit alte RPC nicht auf weg-
--    gedroppte Spalte verweist).
create or replace function public.set_active_master_with_state(
  p_project_id uuid,
  p_image_id uuid,
  p_x_px_u text,
  p_y_px_u text,
  p_width_px_u text,
  p_height_px_u text
) returns void
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_x_u bigint;
  v_y_u bigint;
  v_w_u bigint;
  v_h_u bigint;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  v_x_u := p_x_px_u::bigint;
  v_y_u := p_y_px_u::bigint;
  v_w_u := p_width_px_u::bigint;
  v_h_u := p_height_px_u::bigint;

  if v_w_u <= 0 or v_h_u <= 0 then
    raise exception 'initial placement size must be positive';
  end if;

  perform public.set_active_image(p_project_id, p_image_id);

  insert into public.project_image_state (
    project_id,
    image_id,
    x_px_u,
    y_px_u,
    width_px_u,
    height_px_u,
    rotation_deg
  ) values (
    p_project_id,
    p_image_id,
    v_x_u::text,
    v_y_u::text,
    v_w_u::text,
    v_h_u::text,
    0
  )
  on conflict (project_id, image_id)
  do update
    set x_px_u = excluded.x_px_u,
        y_px_u = excluded.y_px_u,
        width_px_u = excluded.width_px_u,
        height_px_u = excluded.height_px_u,
        rotation_deg = excluded.rotation_deg,
        updated_at = now();
end;
$$;

-- 2. Spalten-Constraints droppen.
alter table public.project_image_state
  drop constraint if exists project_image_state_dpi_positive,
  drop constraint if exists project_image_state_height_px_positive,
  drop constraint if exists project_image_state_width_px_positive,
  drop constraint if exists project_image_state_scale_x_check,
  drop constraint if exists project_image_state_scale_y_check;

-- 3. Spalten droppen.
alter table public.project_image_state
  drop column if exists role,
  drop column if exists x,
  drop column if exists y,
  drop column if exists scale_x,
  drop column if exists scale_y,
  drop column if exists width_px,
  drop column if exists height_px,
  drop column if exists unit,
  drop column if exists dpi;

-- 4. Redundanter Index (existiert evtl. nach PR-4 schon nicht mehr).
drop index if exists public.project_image_state_role_image_idx;

-- 5. Legacy-Enum-Type droppen (wird nirgends sonst verwendet).
drop type if exists public.image_role;

commit;
