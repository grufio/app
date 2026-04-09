-- Migration 048: Reconcile image_state FK and master-state function
--
-- Purpose:
-- - Fix incompatibility between NOT NULL image_id and old FK ON DELETE SET NULL.
-- - Keep project_image_state stable after PK switch to (project_id, image_id).
-- - Ensure set_active_master_with_state upserts on the new PK.

-- 1) Defensive cleanup of legacy/null rows.
DELETE FROM public.project_image_state
WHERE image_id IS NULL;

-- 2) Ensure FK is cascade (NOT set null), compatible with NOT NULL image_id.
ALTER TABLE public.project_image_state
  DROP CONSTRAINT IF EXISTS project_image_state_image_id_fkey;

ALTER TABLE public.project_image_state
  ADD CONSTRAINT project_image_state_image_id_fkey
  FOREIGN KEY (image_id)
  REFERENCES public.project_images(id)
  ON DELETE CASCADE;

-- 3) Canonical function for activating master + initializing/refreshing state.
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
