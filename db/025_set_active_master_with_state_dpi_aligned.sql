-- gruf.io - Align active-master seeded image-state with placement DPI semantics
--
-- Purpose:
-- - Keep server-seeded persisted size aligned with client placement formula:
--   size_px = (pixels / image_dpi) * artboard_dpi
-- - Prevent first-load/reload size jumps when image DPI differs from artboard DPI.

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
  v_artboard_dpi numeric;
  v_image_dpi numeric;
begin
  -- Default to raw pixel size (current behavior) and override when both DPI values are valid.
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
    end,
    pw.artboard_dpi,
    pi.dpi
  into v_artboard_w_u, v_artboard_h_u, v_artboard_dpi, v_image_dpi
  from public.project_workspace pw
  left join public.project_images pi on pi.id = p_image_id
  where pw.project_id = p_project_id;

  if v_artboard_w_u is null then v_artboard_w_u := v_w_u; end if;
  if v_artboard_h_u is null then v_artboard_h_u := v_h_u; end if;

  if v_artboard_dpi is not null and v_artboard_dpi > 0 and v_image_dpi is not null and v_image_dpi > 0 then
    v_w_u := greatest(
      1000000::bigint,
      round(((greatest(1, p_width_px)::numeric / v_image_dpi) * v_artboard_dpi) * 1000000)::bigint
    );
    v_h_u := greatest(
      1000000::bigint,
      round(((greatest(1, p_height_px)::numeric / v_image_dpi) * v_artboard_dpi) * 1000000)::bigint
    );
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
