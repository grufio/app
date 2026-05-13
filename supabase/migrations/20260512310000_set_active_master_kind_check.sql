-- @intent-schema-migration
--
-- Defense-in-depth: enforce `kind = 'master'` at the RPC boundary
-- (C-D2 from the editor-stack review).
--
-- After PR-2 (split image activation from state-seed) and PR-3
-- (axis-pairing + soft-delete trigger), the application no longer
-- calls `set_active_master_with_state` with non-master image_ids
-- (filter/trace/crop flows route through `set_active_image` instead).
-- This migration codifies the contract at the RPC: a malformed or
-- buggy future client cannot bind state to a non-master row.
--
-- The kind check raises errcode 23514 (`check_violation`) so the
-- existing client-side mapping for constraint violations applies.
--
-- Idempotent: CREATE OR REPLACE FUNCTION replaces the existing body.
-- The function signature is unchanged.

CREATE OR REPLACE FUNCTION public.set_active_master_with_state(
  p_project_id uuid,
  p_image_id uuid,
  p_x_px_u text,
  p_y_px_u text,
  p_width_px_u text,
  p_height_px_u text
) RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
declare
  v_x_u bigint;
  v_y_u bigint;
  v_w_u bigint;
  v_h_u bigint;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  -- Defense-in-depth: the application-level split (PR-2) guarantees
  -- only master ids reach this RPC, but guard at the boundary anyway.
  if not exists (
    select 1 from public.project_images
    where id = p_image_id
      and project_id = p_project_id
      and kind = 'master'
      and deleted_at is null
  ) then
    raise exception 'image_id must be a live master image'
      using errcode = '23514',
            detail = format('project_id=%s image_id=%s', p_project_id, p_image_id),
            hint = 'project_image_state is anchored at master.id (PR #124).';
  end if;

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
