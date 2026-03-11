-- Migration 053: Initial master-state seed via DPI relation (fallback image dpi 72)
--
-- Contract:
-- - image_dpi_used = COALESCE(p_image_dpi, 72)
-- - scale = output_dpi / image_dpi_used
-- - width_u = intrinsic_width_u * scale
-- - height_u = intrinsic_height_u * scale
-- - position centered on artboard

-- Remove legacy overload to enforce a single callable RPC signature.
DROP FUNCTION IF EXISTS public.set_active_master_with_state(uuid, uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.set_active_master_with_state(
  p_project_id uuid,
  p_image_id uuid,
  p_width_px integer,
  p_height_px integer,
  p_image_dpi integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_w_u bigint;
  v_h_u bigint;
  v_artboard_w_u bigint;
  v_artboard_h_u bigint;
  v_output_dpi numeric;
  v_image_dpi numeric;
  v_scale numeric;
BEGIN
  v_w_u := greatest(1, p_width_px)::bigint * 1000000;
  v_h_u := greatest(1, p_height_px)::bigint * 1000000;

  PERFORM public.set_active_image(p_project_id, p_image_id);

  SELECT
    CASE
      WHEN pw.width_px_u IS NOT NULL THEN pw.width_px_u::bigint
      ELSE greatest(1, pw.width_px)::bigint * 1000000
    END,
    CASE
      WHEN pw.height_px_u IS NOT NULL THEN pw.height_px_u::bigint
      ELSE greatest(1, pw.height_px)::bigint * 1000000
    END,
    greatest(1, coalesce(pw.output_dpi, 300))::numeric
  INTO v_artboard_w_u, v_artboard_h_u, v_output_dpi
  FROM public.project_workspace pw
  WHERE pw.project_id = p_project_id;

  IF v_artboard_w_u IS NULL THEN v_artboard_w_u := v_w_u; END IF;
  IF v_artboard_h_u IS NULL THEN v_artboard_h_u := v_h_u; END IF;
  IF v_output_dpi IS NULL THEN v_output_dpi := 300; END IF;

  v_image_dpi := greatest(1, coalesce(p_image_dpi, 72))::numeric;
  v_scale := v_output_dpi::numeric / v_image_dpi::numeric;
  IF v_scale <= 0 THEN v_scale := 1.0; END IF;

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
    (v_artboard_w_u / 2)::text,
    (v_artboard_h_u / 2)::text,
    greatest(1, (v_w_u::numeric * v_scale)::bigint)::text,
    greatest(1, (v_h_u::numeric * v_scale)::bigint)::text,
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

ALTER FUNCTION public.set_active_master_with_state(uuid, uuid, integer, integer, integer)
  SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.set_active_master_with_state(uuid, uuid, integer, integer, integer)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
