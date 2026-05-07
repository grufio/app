-- Concurrency: extend project advisory lock to the active-state RPCs.
--
-- Problem: filter-chain RPCs (append/remove/reorder) already serialize
-- per-project via `pg_advisory_xact_lock(hashtext(project_id))`. But the
-- "make this image the active master" path
--   set_active_image → set_active_master_image
--                    → set_active_master_latest
--                    → set_active_master_with_state
-- ran without that lock. So:
--
--   - Master upload + concurrent filter-apply could race: upload's
--     activation flips is_active while the filter chain is being
--     extended on the previous master.
--   - Crop + concurrent filter-apply: crop's activation runs in
--     parallel with the filter append; the chain ends up referencing
--     a master that's no longer is_active.
--   - Two browser tabs editing the same project: each tab's mutation
--     completes independently, last-write-wins on partial state.
--
-- All these races serialize correctly once every project-mutating RPC
-- holds the same `hashtext(project_id)` advisory key. Postgres advisory
-- locks are *reentrant within a transaction*, so nested calls
-- (set_active_master_with_state → set_active_image) re-acquire safely
-- without deadlock.

create or replace function public.set_active_image(
  p_project_id uuid,
  p_image_id uuid
)
returns void
language plpgsql
as $$
declare
  v_target_exists boolean;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  select exists (
    select 1
    from public.project_images pi
    where pi.id = p_image_id
      and pi.project_id = p_project_id
      and pi.deleted_at is null
  )
  into v_target_exists;

  if not v_target_exists then
    raise exception using
      message = 'set_active_image target not found',
      detail = format('project_id=%s image_id=%s', p_project_id, p_image_id),
      hint = 'Ensure the image belongs to the project and is not deleted.';
  end if;

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

alter function public.set_active_image(uuid, uuid)
  set search_path = public, pg_temp;

create or replace function public.set_active_master_image(
  p_project_id uuid,
  p_image_id uuid
)
returns void
language plpgsql
as $$
begin
  -- The inner set_active_image takes the same advisory lock; reentrant
  -- in the same transaction. Acquired here too so the wrapper holds the
  -- lock for any of its own future mutations.
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));
  perform public.set_active_image(p_project_id, p_image_id);
end;
$$;

alter function public.set_active_master_image(uuid, uuid)
  set search_path = public, pg_temp;

create or replace function public.set_active_master_latest(
  p_project_id uuid
)
returns void
language plpgsql
as $$
declare
  v_image_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

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

alter function public.set_active_master_latest(uuid)
  set search_path = public, pg_temp;

create or replace function public.set_active_master_with_state(
  p_project_id uuid,
  p_image_id uuid,
  p_x_px_u text,
  p_y_px_u text,
  p_width_px_u text,
  p_height_px_u text
)
returns void
language plpgsql
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
    v_x_u::text,
    v_y_u::text,
    v_w_u::text,
    v_h_u::text,
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

alter function public.set_active_master_with_state(uuid, uuid, text, text, text, text)
  set search_path = public, pg_temp;

grant execute on function public.set_active_master_with_state(uuid, uuid, text, text, text, text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
