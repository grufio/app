-- gruf.io - Active-image contract + variant lineage fields
--
-- Purpose:
-- - Keep the initial master immutable (`role='master'`).
-- - Allow derived variants (`role='asset'`) to become the active working image.
-- - Add generic lineage (`source_image_id`) and crop metadata (`crop_rect_px`).
-- - Replace "one active master" with "one active image" per project.

alter table public.project_images
  add column if not exists source_image_id uuid,
  add column if not exists crop_rect_px jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_images_source_image_id_fkey'
      and conrelid = 'public.project_images'::regclass
  ) then
    alter table public.project_images
      add constraint project_images_source_image_id_fkey
      foreign key (source_image_id)
      references public.project_images(id)
      on delete restrict;
  end if;
end $$;

alter table public.project_images
  drop constraint if exists project_images_crop_rect_shape_ck,
  drop constraint if exists project_images_crop_rect_number_int_ck,
  drop constraint if exists project_images_crop_rect_value_ck,
  drop constraint if exists project_images_crop_rect_requires_source_ck,
  drop constraint if exists project_images_derived_role_ck;

alter table public.project_images
  add constraint project_images_crop_rect_shape_ck check (
    crop_rect_px is null
    or (
      jsonb_typeof(crop_rect_px) = 'object'
      and crop_rect_px ?& array['x', 'y', 'w', 'h']
      and (crop_rect_px - 'x' - 'y' - 'w' - 'h') = '{}'::jsonb
    )
  ),
  add constraint project_images_crop_rect_number_int_ck check (
    crop_rect_px is null
    or (
      jsonb_typeof(crop_rect_px->'x') = 'number'
      and jsonb_typeof(crop_rect_px->'y') = 'number'
      and jsonb_typeof(crop_rect_px->'w') = 'number'
      and jsonb_typeof(crop_rect_px->'h') = 'number'
      and ((crop_rect_px->>'x')::numeric % 1) = 0
      and ((crop_rect_px->>'y')::numeric % 1) = 0
      and ((crop_rect_px->>'w')::numeric % 1) = 0
      and ((crop_rect_px->>'h')::numeric % 1) = 0
    )
  ),
  add constraint project_images_crop_rect_value_ck check (
    crop_rect_px is null
    or (
      (crop_rect_px->>'x')::integer >= 0
      and (crop_rect_px->>'y')::integer >= 0
      and (crop_rect_px->>'w')::integer >= 10
      and (crop_rect_px->>'h')::integer >= 10
    )
  ),
  add constraint project_images_crop_rect_requires_source_ck check (
    crop_rect_px is null or source_image_id is not null
  ),
  add constraint project_images_derived_role_ck check (
    source_image_id is null or role = 'asset'
  );

drop index if exists project_images_one_active_master_idx;

create unique index if not exists project_images_one_active_image_idx
  on public.project_images (project_id)
  where is_active is true and deleted_at is null;

create or replace function public.set_active_image(
  p_project_id uuid,
  p_image_id uuid
)
returns void
language plpgsql
as $$
begin
  update public.project_images
  set is_active = false
  where project_id = p_project_id
    and deleted_at is null;

  update public.project_images
  set is_active = true
  where id = p_image_id
    and project_id = p_project_id
    and deleted_at is null;
end;
$$;

create or replace function public.set_active_master_image(p_project_id uuid, p_image_id uuid)
returns void
language plpgsql
as $$
begin
  perform public.set_active_image(p_project_id, p_image_id);
end;
$$;

create or replace function public.set_active_master_latest(p_project_id uuid)
returns void
language plpgsql
as $$
declare
  v_image_id uuid;
begin
  select id
  into v_image_id
  from public.project_images
  where project_id = p_project_id
    and deleted_at is null
  order by created_at desc
  limit 1;

  if v_image_id is not null then
    perform public.set_active_image(p_project_id, v_image_id);
  end if;
end;
$$;

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

  perform public.set_active_image(p_project_id, p_image_id);

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
