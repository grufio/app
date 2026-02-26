-- Migration 047: Force cleanup NULL image_ids and prevent future issues

DELETE FROM public.project_image_state WHERE image_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_active_master_with_state(
  p_project_id uuid,
  p_image_id uuid,
  p_width_px integer,
  p_height_px integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_w_u bigint;
  v_h_u bigint;
  v_artboard_w_u bigint;
  v_artboard_h_u bigint;
  v_image_dpi_x numeric;
  v_artboard_dpi numeric;
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
    pw.output_dpi
  INTO v_artboard_w_u, v_artboard_h_u, v_artboard_dpi
  FROM public.project_workspace pw
  WHERE pw.project_id = p_project_id;

  IF v_artboard_w_u IS NULL THEN v_artboard_w_u := v_w_u; END IF;
  IF v_artboard_h_u IS NULL THEN v_artboard_h_u := v_h_u; END IF;

  SELECT pi.dpi_x
  INTO v_image_dpi_x
  FROM public.project_images pi
  WHERE pi.id = p_image_id;

  IF v_artboard_dpi IS NOT NULL AND v_artboard_dpi > 0 AND v_image_dpi_x IS NOT NULL AND v_image_dpi_x > 0 THEN
    v_scale := v_image_dpi_x / v_artboard_dpi;
  ELSE
    v_scale := 1.0;
  END IF;

  DELETE FROM public.project_image_state
  WHERE project_id = p_project_id AND (image_id = p_image_id OR image_id IS NULL);

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
    (v_w_u * v_scale)::bigint::text,
    (v_h_u * v_scale)::bigint::text,
    0
  );
END;
$$;
