-- Migration 043: Reconcile image-state contract after partial 021/042 rollouts.
--
-- Canonical target:
-- - project_image_state keyed by (project_id, image_id)
-- - image_id is NOT NULL
-- - FK project_image_state.image_id -> project_images.id uses ON DELETE CASCADE
-- - set_active_master_with_state upserts on (project_id, image_id)

-- 1) Backfill legacy NULL image_id rows when an active master exists.
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

-- 2) Remove rows that cannot be repaired.
delete from public.project_image_state
where image_id is null;

-- 3) Deduplicate rows by canonical key before adding PK.
with ranked as (
  select
    ctid,
    row_number() over (
      partition by project_id, image_id
      order by updated_at desc nulls last, created_at desc nulls last
    ) as rn
  from public.project_image_state
)
delete from public.project_image_state pis
using ranked r
where pis.ctid = r.ctid
  and r.rn > 1;

-- 4) Enforce NOT NULL image_id and canonical PK.
alter table public.project_image_state
  alter column image_id set not null;

alter table public.project_image_state
  drop constraint if exists project_image_state_pk;

alter table public.project_image_state
  add constraint project_image_state_pk primary key (project_id, image_id);

create index if not exists project_image_state_role_idx
  on public.project_image_state (role);

-- 5) Force FK delete behavior to CASCADE (never SET NULL).
alter table public.project_image_state
  drop constraint if exists project_image_state_image_id_fkey;

alter table public.project_image_state
  add constraint project_image_state_image_id_fkey
  foreign key (image_id)
  references public.project_images(id)
  on delete cascade;

-- 6) Canonical function definition with image-id conflict key.
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
  v_image_dpi_x numeric;
  v_artboard_dpi numeric;
  v_scale numeric;
begin
  v_w_u := greatest(1, p_width_px)::bigint * 1000000;
  v_h_u := greatest(1, p_height_px)::bigint * 1000000;

  perform public.set_active_image(p_project_id, p_image_id);

  select
    case
      when pw.width_px_u is not null then pw.width_px_u::bigint
      else greatest(1, pw.width_px)::bigint * 1000000
    end,
    case
      when pw.height_px_u is not null then pw.height_px_u::bigint
      else greatest(1, pw.height_px)::bigint * 1000000
    end,
    pw.output_dpi
  into v_artboard_w_u, v_artboard_h_u, v_artboard_dpi
  from public.project_workspace pw
  where pw.project_id = p_project_id;

  if v_artboard_w_u is null then v_artboard_w_u := v_w_u; end if;
  if v_artboard_h_u is null then v_artboard_h_u := v_h_u; end if;

  select pi.dpi_x
  into v_image_dpi_x
  from public.project_images pi
  where pi.id = p_image_id;

  if v_artboard_dpi is not null and v_artboard_dpi > 0 and v_image_dpi_x is not null and v_image_dpi_x > 0 then
    v_scale := v_image_dpi_x / v_artboard_dpi;
  else
    v_scale := 1.0;
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
    (v_w_u * v_scale)::bigint::text,
    (v_h_u * v_scale)::bigint::text,
    0
  )
  on conflict (project_id, image_id)
  do update
    set role = excluded.role,
        x_px_u = excluded.x_px_u,
        y_px_u = excluded.y_px_u,
        width_px_u = excluded.width_px_u,
        height_px_u = excluded.height_px_u,
        rotation_deg = excluded.rotation_deg,
        updated_at = now();
end;
$$;
