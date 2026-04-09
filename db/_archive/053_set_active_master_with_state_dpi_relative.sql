-- Migration 053: Persist precomputed initial master-state placement (single formula source in TypeScript)
--
-- Contract:
-- - Client/server compute x/y/width/height via shared TS DPI formula.
-- - SQL persists exactly those µpx values without recalculating scale.

-- Remove legacy overloads to enforce a single callable RPC signature.
DROP FUNCTION IF EXISTS public.set_active_master_with_state(uuid, uuid, integer, integer);
DROP FUNCTION IF EXISTS public.set_active_master_with_state(uuid, uuid, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.set_active_master_with_state(
  p_project_id uuid,
  p_image_id uuid,
  p_x_px_u text,
  p_y_px_u text,
  p_width_px_u text,
  p_height_px_u text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_x_u bigint;
  v_y_u bigint;
  v_w_u bigint;
  v_h_u bigint;
BEGIN
  v_x_u := p_x_px_u::bigint;
  v_y_u := p_y_px_u::bigint;
  v_w_u := p_width_px_u::bigint;
  v_h_u := p_height_px_u::bigint;

  IF v_w_u <= 0 OR v_h_u <= 0 THEN
    RAISE EXCEPTION 'initial placement size must be positive';
  END IF;

  PERFORM public.set_active_image(p_project_id, p_image_id);

  INSERT INTO public.project_image_state (
    project_id,
    role,
    image_id,
    x_px_u,
    y_px_u,
    width_px_u,
    height_px_u,
    rotation_deg
  ) VALUES (
    p_project_id,
    'master',
    p_image_id,
    v_x_u::text,
    v_y_u::text,
    v_w_u::text,
    v_h_u::text,
    0
  )
  ON CONFLICT (project_id, image_id)
  DO UPDATE
    SET role = excluded.role,
        x_px_u = excluded.x_px_u,
        y_px_u = excluded.y_px_u,
        width_px_u = excluded.width_px_u,
        height_px_u = excluded.height_px_u,
        rotation_deg = excluded.rotation_deg,
        updated_at = now();
END;
$$;

ALTER FUNCTION public.set_active_master_with_state(uuid, uuid, text, text, text, text)
  SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.set_active_master_with_state(uuid, uuid, text, text, text, text)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
