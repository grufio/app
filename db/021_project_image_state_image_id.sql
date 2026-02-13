-- gruf.io - Bind persisted master transform state to active image id

alter table public.project_image_state
  add column if not exists image_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_image_state_image_id_fkey'
      and conrelid = 'public.project_image_state'::regclass
  ) then
    alter table public.project_image_state
      add constraint project_image_state_image_id_fkey
      foreign key (image_id)
      references public.project_images(id)
      on delete set null;
  end if;
end $$;

create index if not exists project_image_state_project_role_image_idx
  on public.project_image_state (project_id, role, image_id);

-- Backfill existing master-state rows to current active master image.
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
begin
  v_w_u := greatest(1, p_width_px)::bigint * 1000000;
  v_h_u := greatest(1, p_height_px)::bigint * 1000000;

  update public.project_images
  set is_active = false
  where project_id = p_project_id
    and role = 'master'
    and deleted_at is null;

  update public.project_images
  set is_active = true
  where id = p_image_id
    and project_id = p_project_id
    and role = 'master'
    and deleted_at is null;

  select
    case
      when pw.width_px_u is not null then pw.width_px_u::bigint
      else greatest(1, pw.width_px)::bigint * 1000000
    end,
    case
      when pw.height_px_u is not null then pw.height_px_u::bigint
      else greatest(1, pw.height_px)::bigint * 1000000
    end
  into v_artboard_w_u, v_artboard_h_u
  from public.project_workspace pw
  where pw.project_id = p_project_id;

  if v_artboard_w_u is null then v_artboard_w_u := v_w_u; end if;
  if v_artboard_h_u is null then v_artboard_h_u := v_h_u; end if;

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
    v_w_u::text,
    v_h_u::text,
    0
  )
  on conflict (project_id, role)
  do update
    set image_id = excluded.image_id,
        x_px_u = excluded.x_px_u,
        y_px_u = excluded.y_px_u,
        width_px_u = excluded.width_px_u,
        height_px_u = excluded.height_px_u,
        rotation_deg = excluded.rotation_deg;
end;
$$;
